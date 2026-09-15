/**
 * One-time backfill for image files: store the EXIF-oriented pixel dimensions
 * on the `files` row and generate the webp derivatives (`<base>.256.webp`,
 * `<base>.1024.webp`) that are served for `?w=` requests (#472). Both concerns
 * share one download per image: the download dominates the cost.
 *
 * Runs as part of `npm run migrate` (via `migrate.ts`), after
 * migrate-promote-originals so derivatives come from the pristine source and
 * before migrate-topo-paths which reads the stored dimensions. Can also be run
 * on its own to preview:
 *   npx tsx src/lib/db/scripts/migrate-image-derivatives.ts --dry-run
 *
 * Idempotent: rows with stored dimensions whose derivatives all exist are
 * skipped. A file that is merely GONE (404) is warned and left for a re-run: a missing derivative
 * degrades to the Nextcloud-preview fallback at serve time, it never breaks. Any other storage
 * error aborts, because skipping it leaves dimensions unwritten and migrate-topo-paths then
 * converts nothing at all, silently.
 */
import { eq } from 'drizzle-orm'
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { pathToFileURL } from 'node:url'
import Database from 'postgres'
import sharp from 'sharp'
import drizzleConfig from '../../../../drizzle.config'
import {
  DERIVATIVE_QUALITY,
  DERIVATIVE_SIZES,
  derivativePath,
  isDerivableImage,
  orientedDimensions,
} from '../../images/derivatives'
import * as schema from '../schema'
import { connectNextcloud, listingCache, rethrowUnlessMissing } from './nextcloud'

/** `/topos/138.jpg` → `/topos` (stored paths always have a leading slash). */
const parentOf = (path: string): string => path.slice(0, path.lastIndexOf('/'))

const nameOf = (path: string): string => path.slice(path.lastIndexOf('/') + 1)

const CONCURRENCY = 4

export const migrate = async (db: PostgresJsDatabase<typeof schema>, { dryRun = false }: { dryRun?: boolean } = {}) => {
  const { dav, userPath } = await connectNextcloud()

  const listingOf = listingCache({ dav, userPath })

  const rows = await db
    .select({ height: schema.files.height, id: schema.files.id, path: schema.files.path, width: schema.files.width })
    .from(schema.files)

  const skipped: Record<string, string[]> = {}
  const skip = (reason: string, ids: string[]) => (skipped[reason] ??= []).push(...ids)

  // `files` contains duplicate rows for the same storage path: download and
  // encode once per path, but write dims to every row sharing it.
  const byPath = new Map<string, typeof rows>()
  for (const row of rows) {
    if (isDerivableImage(row.path)) {
      const group = byPath.get(row.path)
      if (group == null) {
        byPath.set(row.path, [row])
      } else {
        group.push(row)
      }
    } else {
      skip('not an image', [row.id])
    }
  }
  const paths = [...byPath.keys()]

  let processed = 0

  const processPath = async (path: string) => {
    const group = byPath.get(path)!
    const ids = group.map((row) => row.id)
    const listing = await listingOf(parentOf(path))
    const missingSizes = DERIVATIVE_SIZES.filter((size) => !listing.has(nameOf(derivativePath(path, size))))
    const needsDims = group.some((row) => row.width == null || row.height == null)
    if (!needsDims && missingSizes.length === 0) {
      return
    }

    processed += 1
    const work = [...(needsDims ? ['dims'] : []), ...missingSizes.map((size) => `${size}.webp`)].join(', ')
    console.log(`[file #${ids.join(', #')}] ${dryRun ? 'would generate' : 'generating'} ${work} (${path})`)

    if (dryRun) {
      return
    }

    let buffer: Buffer
    try {
      buffer = Buffer.from((await dav.getFileContents(userPath(path))) as ArrayBuffer)
    } catch (err) {
      // Swallowing a storage-wide failure here leaves dimensions unwritten, which in turn makes
      // migrate-topo-paths convert nothing at all, silently.
      rethrowUnlessMissing(err)
      console.warn(`Could not download "${path}":`, err instanceof Error ? err.message : err)
      skip('unreadable image', ids)
      return
    }

    let dims: null | { height: number; width: number } = null
    try {
      dims = orientedDimensions(await sharp(buffer).metadata())
    } catch (err) {
      console.warn(`Could not read dimensions of "${path}":`, err instanceof Error ? err.message : err)
    }
    if (dims == null) {
      skip('unreadable image', ids)
      return
    }

    for (const row of group) {
      if (row.width !== dims.width || row.height !== dims.height) {
        await db.update(schema.files).set({ height: dims.height, width: dims.width }).where(eq(schema.files.id, row.id))
      }
    }

    for (const size of missingSizes) {
      try {
        const webp = await sharp(buffer)
          // Bake the EXIF orientation in: the resized derivative carries no metadata.
          .rotate()
          .resize({ fit: 'inside', height: size, width: size, withoutEnlargement: true })
          .webp({ quality: DERIVATIVE_QUALITY })
          .toBuffer()
        await dav.putFileContents(userPath(derivativePath(path, size)), webp)
      } catch (err) {
        console.warn(`Could not write ${size}px derivative of "${path}":`, err instanceof Error ? err.message : err)
        skip('derivative failed', ids)
      }
    }
  }

  // Simple worker pool: downloads dominate, sharp encodes are fast; a handful
  // of files in flight saturates the connection without hammering Nextcloud.
  let cursor = 0
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (cursor < paths.length) {
        await processPath(paths[cursor++])
      }
    }),
  )

  console.log(`\n${dryRun ? 'DRY RUN: ' : ''}processed ${processed} of ${paths.length} image path(s).`)
  for (const [reason, ids] of Object.entries(skipped)) {
    console.log(`Skipped (${reason}): #${ids.join(', #')}`)
  }
}

// Standalone preview: `npx tsx src/lib/db/scripts/migrate-image-derivatives.ts [--dry-run]`.
if (process.argv[1] != null && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const postgres = Database(drizzleConfig.dbCredentials.url, { prepare: false })
  await migrate(drizzle(postgres, { schema }), { dryRun: process.argv.includes('--dry-run') })
  await postgres.end()
}
