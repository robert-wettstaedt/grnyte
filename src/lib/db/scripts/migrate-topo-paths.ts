/**
 * One-time migration: rewrite legacy `topo_routes.path` values stored in
 * absolute pixels of the original photo into the current resolution-independent
 * 0–1 fractions. Pixel paths only render correctly when the browser loads the
 * full-res original; resized previews (route-row thumbnails) can't place them,
 * because the original's dimensions aren't stored anywhere.
 *
 * Each image's dimensions come from the `files` table (`width`/`height`,
 * EXIF-oriented — legacy points were drawn against the browser-oriented image;
 * backfilled by migrate-image-derivatives, which runs first) and every
 * coordinate is divided by the oriented size.
 *
 * Runs as part of `npm run migrate` (via `migrate.ts`). Can also be run on its
 * own to preview:
 *   npx tsx src/lib/db/scripts/migrate-topo-paths.ts --dry-run
 *
 * Idempotent: already-normalized rows (all coordinates ≤ 1.5, the same
 * heuristic the renderer uses) are skipped. Rows without stored dimensions
 * (e.g. PDF topos) or whose coordinates don't fit the image are left untouched
 * and logged.
 */
import { eq, isNotNull } from 'drizzle-orm'
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { pathToFileURL } from 'node:url'
import Database from 'postgres'
import drizzleConfig from '../../../../drizzle.config'
import { isNormalized } from '../../entities/topo/path'
import * as schema from '../schema'

const tokenRegex = /^([ML])(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/i

/**
 * Rewrite one stored path from pixel space to 0–1 fractions of `width`×`height`,
 * preserving the token structure (`M`/`L` letters, trailing `Z` marker).
 * Returns `null` when the path needs no migration or can't be converted safely:
 * already normalized, unparsable, or coordinates outside the image (dimension
 * mismatch — converting would corrupt it). `reason` says which.
 */
export const normalizePath = (
  path: string,
  width: number,
  height: number,
): { next: string } | { next: null; reason: 'normalized' | 'unparsable' | 'out-of-bounds' | 'empty' } => {
  const tokens = path.trim().split(/\s+/)
  if (tokens.length === 0 || path.trim() === '') {
    return { next: null, reason: 'empty' }
  }

  const parsed: ({ letter: string; x: number; y: number } | 'Z')[] = []
  for (const token of tokens) {
    if (token.toUpperCase() === 'Z') {
      parsed.push('Z')
      continue
    }
    const match = tokenRegex.exec(token)
    if (match == null) {
      return { next: null, reason: 'unparsable' }
    }
    parsed.push({ letter: match[1].toUpperCase(), x: Number(match[2]), y: Number(match[3]) })
  }

  const points = parsed.filter((token) => token !== 'Z')
  if (points.length === 0) {
    return { next: null, reason: 'empty' }
  }

  // Same heuristic the renderer gates on — using it here guarantees the two agree.
  if (isNormalized(points.map((point) => ({ id: '', type: 'middle' as const, x: point.x, y: point.y })))) {
    return { next: null, reason: 'normalized' }
  }

  const scaled = points.map((point) => ({ ...point, x: point.x / width, y: point.y / height }))

  // A correctly-drawn line lies within its image; slight overshoot (a few px past
  // the edge) is fine, anything further means these aren't this image's pixels.
  if (scaled.some((point) => point.x < -0.05 || point.x > 1.05 || point.y < -0.05 || point.y > 1.05)) {
    return { next: null, reason: 'out-of-bounds' }
  }

  let index = 0
  const next = parsed
    .map((token) => {
      if (token === 'Z') {
        return 'Z'
      }
      const point = scaled[index++]
      return `${token.letter}${round(point.x)},${round(point.y)}`
    })
    .join(' ')

  return { next }
}

/** 5 decimals ≈ 0.05px error on a 4000px photo — plenty, and keeps paths short. */
const round = (value: number): number => Number(value.toFixed(5))

export const migrate = async (db: PostgresJsDatabase<typeof schema>, { dryRun = false }: { dryRun?: boolean } = {}) => {
  const rows = await db
    .select({
      id: schema.topoRoutes.id,
      path: schema.topoRoutes.path,
      width: schema.files.width,
      height: schema.files.height,
    })
    .from(schema.topoRoutes)
    .innerJoin(schema.topos, eq(schema.topoRoutes.topoFk, schema.topos.id))
    .innerJoin(schema.files, eq(schema.topos.fileFk, schema.files.id))
    .where(isNotNull(schema.topoRoutes.path))

  let converted = 0
  const skipped: Record<string, number[]> = {}
  const skip = (reason: string, id: number) => (skipped[reason] ??= []).push(id)

  for (const row of rows) {
    if (row.path == null || row.path.trim() === '') {
      continue
    }

    // Cheap peek: fully-normalized paths don't need dimensions at all.
    const coords = row.path.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? []
    if (coords.length > 0 && coords.every((value) => value <= 1.5)) {
      continue
    }

    if (row.width == null || row.height == null) {
      skip('no dimensions', row.id)
      continue
    }

    const result = normalizePath(row.path, row.width, row.height)
    if (result.next == null) {
      if (result.reason !== 'normalized') {
        skip(result.reason, row.id)
      }
      continue
    }

    converted += 1
    console.log('===')
    console.log(`[topo_route #${row.id}] ${dryRun ? 'would convert' : 'converting'} (${row.width}×${row.height})`)
    console.log(`  - ${row.path}`)
    console.log(`  + ${result.next}`)

    if (!dryRun) {
      await db.update(schema.topoRoutes).set({ path: result.next }).where(eq(schema.topoRoutes.id, row.id))
    }
  }

  console.log(`\n${dryRun ? 'DRY RUN — ' : ''}converted ${converted} of ${rows.length} path(s).`)
  for (const [reason, ids] of Object.entries(skipped)) {
    console.log(`Skipped (${reason}): #${ids.join(', #')}`)
  }
}

// Standalone preview: `npx tsx src/lib/db/scripts/migrate-topo-paths.ts [--dry-run]`.
if (process.argv[1] != null && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const postgres = Database(drizzleConfig.dbCredentials.url, { prepare: false })
  await migrate(drizzle(postgres, { schema }), { dryRun: process.argv.includes('--dry-run') })
  await postgres.end()
}
