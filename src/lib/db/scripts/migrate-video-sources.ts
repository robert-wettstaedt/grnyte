/**
 * One-time migration: move inlined beta-video source URLs from route descriptions into
 * `bunny_streams.source`. The pre-2.0 convention was a markdown link titled "*beta*" or
 * "*video*" in the route description; the `source` column now credits the clip's origin
 * on the route page.
 *
 * A route is migrated only when the mapping is unambiguous:
 *  - exactly ONE markdown link whose title contains "beta" or "video" (case-insensitive)
 *  - exactly ONE route-attached file with a bunny stream, and its `source` is still null
 *    (a second stream on the route, even an already-sourced one, blocks migration)
 *  - no other video-host URLs (YouTube/Instagram/Vimeo) in the description
 * The link's URL is written to `bunny_streams.source` and the link is removed from the
 * description (the whole line, if only filler like "Beta:" remains). Anything ambiguous
 * (link without video, video without link, multiples, source already set, stray video
 * URLs or links with other titles) is flagged in the console and left untouched.
 *
 * Ascent clips are ignored: `source` is a route-video concept (see schema comment).
 *
 * Deliberately NOT registered in migrate.ts: unlike the other migrate-* scripts, its
 * trigger condition regrows from normal 2.0 usage (a beta-titled link next to an
 * unsourced own-footage upload), so running it on every deploy would silently rewrite
 * post-launch user content. Run it once, manually:
 *   npx tsx src/lib/db/scripts/migrate-video-sources.ts --dry-run   # preview
 *   npx tsx src/lib/db/scripts/migrate-video-sources.ts            # apply
 *
 * Re-running is still safe: migrating removes the matching link, and a stream with
 * `source` already set is never overwritten.
 */
import { sql } from 'drizzle-orm'
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { pathToFileURL } from 'node:url'
import Database from 'postgres'
import drizzleConfig from '../../../../drizzle.config'
import * as schema from '../schema'

// Markdown links, single-line, excluding image embeds. Captures title and URL (URL capture
// stops at whitespace so `[t](url "title")` yields only the URL).
const linkPattern = /(?<!!)\[([^\]\n]*)\]\( *([^)\s]+)[^)\n]*\)/g
const titlePattern = /beta|video/i
// Any subdomain (www., m., ...): a missed variant would bypass the stray-URL ambiguity guard.
const videoHostPattern =
  /https?:\/\/(?:[\w-]+\.)*(?:youtube\.com|youtu\.be|youtube-nocookie\.com|instagram\.com|instagr\.am|vimeo\.com)\/[^\s)\]]*/gi

export interface DescriptionAnalysis {
  /** Markdown links whose title matches "beta"/"video". `text` is the full `[..](..)` match. */
  links: { text: string; title: string; url: string }[]
  /** Video-host URLs (bare or in non-matching links) not covered by a matching link. */
  strayVideoUrls: string[]
}

export const analyzeDescription = (description: string): DescriptionAnalysis => {
  const links = Array.from(description.matchAll(linkPattern), ([text, title, url]) => ({ text, title, url })).filter(
    // The http check drops prose in parens ("[Video](folgt in Kürze)") that would otherwise
    // migrate a bare word into `source`.
    (link) => titlePattern.test(link.title) && /^https?:\/\//i.test(link.url),
  )
  const linkUrls = new Set(links.map((link) => link.url))
  const strayVideoUrls = [...new Set(Array.from(description.matchAll(videoHostPattern), (match) => match[0]))].filter(
    (url) => !linkUrls.has(url),
  )
  return { links, strayVideoUrls }
}

export const stripLink = (description: string, linkText: string): string => {
  const lines = description.split('\n')
  const index = lines.findIndex((line) => line.includes(linkText))
  const stripped = lines[index].replace(linkText, '')
  // Drop the whole line when only connective filler remains ("Beta:", "- video", "→").
  const leftoverWords = stripped.replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
  if (/^((beta|video|hier|here)\s*)*$/i.test(leftoverWords)) {
    lines.splice(index, 1)
  } else {
    lines[index] = stripped.replace(/ {2,}/g, ' ').trimEnd()
  }
  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export const migrate = async (db: PostgresJsDatabase<typeof schema>, { dryRun = false }: { dryRun?: boolean } = {}) => {
  const videoRows = (await db.execute(sql`
    select f.route_fk as route_id, bs.id as stream_id, bs.source
    from files f
    join bunny_streams bs on bs.id = f.bunny_stream_fk
    where f.route_fk is not null and f.ascent_fk is null
  `)) as unknown as { route_id: number; source: null | string; stream_id: string }[]

  const videosByRoute = new Map<number, typeof videoRows>()
  for (const row of videoRows) {
    videosByRoute.set(row.route_id, [...(videosByRoute.get(row.route_id) ?? []), row])
  }

  // Small table: fetch all routes and analyze in JS rather than prefiltering in SQL.
  const routes = (await db.execute(sql`
    select id, name, description from routes order by id
  `)) as unknown as { description: null | string; id: number; name: string }[]

  let migrated = 0
  let flagged = 0

  for (const route of routes) {
    const description = route.description ?? ''
    const { links, strayVideoUrls } = analyzeDescription(description)
    const videos = videosByRoute.get(route.id) ?? []
    const targets = videos.filter((video) => video.source === null)

    // No inlined source and nothing awaiting one (streams with `source` set are done).
    if (links.length === 0 && strayVideoUrls.length === 0 && targets.length === 0) continue

    const label = `route #${route.id} "${route.name}"`

    if (links.length === 1 && videos.length === 1 && targets.length === 1 && strayVideoUrls.length === 0) {
      const [link] = links
      const next = stripLink(description, link.text)
      console.log(`  ${label}: bunny_streams.source ← ${link.url}`)
      if (dryRun) {
        console.log(`    description: ${JSON.stringify(description)} → ${JSON.stringify(next)}`)
      } else {
        await db.transaction(async (tx) => {
          await tx.execute(sql`update bunny_streams set source = ${link.url} where id = ${targets[0].stream_id}`)
          await tx.execute(sql`update routes set description = ${next === '' ? null : next} where id = ${route.id}`)
        })
      }
      migrated++
      continue
    }

    const sourced = videos.length - targets.length
    console.warn(
      `  ⚠ ${label}: left as is, ${links.length} matching link(s), ${targets.length} unsourced bunny video(s)` +
        (sourced > 0 ? ` (+${sourced} already sourced)` : '') +
        (strayVideoUrls.length > 0 ? `, stray video URL(s): ${strayVideoUrls.join(' ')}` : '') +
        (links.length > 0 ? `, link(s): ${links.map((link) => link.text).join(' ')}` : ''),
    )
    flagged++
  }

  console.log(
    `\n${dryRun ? 'DRY RUN: ' : ''}migrated ${migrated} route video source(s), flagged ${flagged} for manual review.`,
  )
}

// Standalone preview: `npx tsx src/lib/db/scripts/migrate-video-sources.ts [--dry-run]`.
if (process.argv[1] != null && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const postgres = Database(drizzleConfig.dbCredentials.url, { prepare: false })
  await migrate(drizzle(postgres, { schema }), { dryRun: process.argv.includes('--dry-run') })
  await postgres.end()
}
