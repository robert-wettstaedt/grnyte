/**
 * The DB half of the markdown pipeline: resolving `!type:id!` reference tokens against
 * real rows, and the async render that does it in one call.
 *
 * Split out of `./index` and named `.server.ts` on purpose. `import * as schema from
 * '$lib/db/schema'` is a value import, and `schema.ts` is all top-level `pgTable(...)`
 * calls, so it is one big module side effect that no bundler can tree-shake. While these
 * two functions lived next to `convertMarkdownToHtmlSync`, every screen that renders a
 * `<Markdown>` (which is most of them) pulled the whole Drizzle schema into the client
 * bundle. The `.server.ts` suffix makes SvelteKit's server-only guard fail the build if
 * anything client-reachable imports this again, so the boundary cannot quietly rot back.
 *
 * Caveat: that guard is skipped when `process.env.TEST === 'true'`, so a regression shows
 * up in `npm run build`, never in vitest.
 */
import * as schema from '$lib/db/schema'
import { and, eq } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import rehypeStringify from 'rehype-stringify'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'
import { REFERENCE_TOMBSTONE, referenceRegex, remarkReferences, type EncloseOptions } from './remark-references'
import { remarkSafeUrls } from './remark-safe-urls'

export const convertMarkdownToHtml = async (
  markdown: null | string | undefined,
  db?: PostgresJsDatabase<typeof schema>,
  encloseReferences?: EncloseOptions,
): Promise<string> => {
  if (markdown == null) {
    return ''
  }

  const enrichedMarkdown = await enrichMarkdown(markdown, db)

  const result = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkReferences, { encloseReferences })
    // Last of the remark passes, so it also covers whatever the passes above produced.
    .use(remarkSafeUrls)
    .use(remarkRehype)
    .use(rehypeStringify)
    .process(enrichedMarkdown)

  if (typeof result.value !== 'string') {
    throw new Error('Failed to convert markdown to html')
  }

  return result.value
}

/**
 * @param regionFk When set, resolution is scoped to that region: an area/block/route/user
 * outside it renders as a tombstone instead of leaking its name. Pass it when the enriched
 * output is shown out of the viewer's own access context (the public `/f/<id>` share page),
 * where a privileged `db` would otherwise resolve names across every private region.
 */
export const enrichMarkdown = async (
  markdown: string,
  db?: PostgresJsDatabase<typeof schema>,
  regionFk?: number,
): Promise<string> => {
  const matchesIterator = markdown.matchAll(new RegExp(referenceRegex, 'gi'))
  const matches = Array.from(matchesIterator ?? []).reverse()

  if (db == null || matches.length === 0) {
    return markdown
  }

  const refs = await Promise.all(
    matches.map(async (match) => {
      const [type, id] = match[0]
        .trim()
        .substring(1, match[0].length - 1)
        .split(':')

      const idNumber = Number(id)

      // `users` has no `name` column: its display name is `username`. The
      // other tables expose `name`, so branch the column selection by type.
      const result =
        type === 'users'
          ? await (async () => {
              // Region scope for a user = membership: only resolve a user who belongs to the
              // file's region, so a public share can't reveal members of other regions.
              if (regionFk != null) {
                return (
                  await db
                    .select({ name: schema.users.username })
                    .from(schema.users)
                    .innerJoin(
                      schema.regionMembers,
                      and(
                        eq(schema.regionMembers.userFk, schema.users.id),
                        eq(schema.regionMembers.regionFk, regionFk),
                      ),
                    )
                    .where(eq(schema.users.id, idNumber))
                ).at(0)
              }
              return (
                await db.select({ name: schema.users.username }).from(schema.users).where(eq(schema.users.id, idNumber))
              ).at(0)
            })()
          : await (async () => {
              const dbSchema = type === 'areas' ? schema.areas : type === 'blocks' ? schema.blocks : schema.routes
              const results = await db
                .select({ name: dbSchema.name })
                .from(dbSchema)
                .where(
                  regionFk == null
                    ? eq(dbSchema.id, idNumber)
                    : and(eq(dbSchema.id, idNumber), eq(dbSchema.regionFk, regionFk)),
                )
              return results.at(0)
            })()

      // A deleted target renders as a tombstone ("… not found") rather than the raw token.
      const payload = result == null ? REFERENCE_TOMBSTONE : result.name

      let reference = ''
      if (match[0].indexOf('!') > 0) {
        reference += ' '
      }

      reference += `!${type}:${id}:${btoa(payload)}!`

      return { match, reference }
    }),
  )

  return refs.reduce((str, item) => {
    const before = str.substring(0, item.match.index)
    const after = str.substring(item.match.index + item.match[0].length)

    return before + item.reference + after
  }, markdown)
}
