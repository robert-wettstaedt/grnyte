/**
 * One-time backfill for image files: store the EXIF-oriented pixel dimensions
 * on the `files` row and generate the webp derivatives (`<base>.256.webp`,
 * `<base>.1024.webp`) that are served for `?w=` requests (#472). Both concerns
 * share one download per image — the download dominates the cost.
 *
 * Runs as part of `npm run migrate` (via `migrate.ts`), after
 * migrate-promote-originals so derivatives come from the pristine source and
 * before migrate-topo-paths which reads the stored dimensions. Can also be run
 * on its own to preview:
 *   npx tsx src/lib/db/scripts/migrate-image-derivatives.ts --dry-run
 *
 * Idempotent: rows with stored dimensions whose derivatives all exist are
 * skipped. Unreadable images and failed uploads are warned and left for a
 * re-run — a missing derivative degrades to the Nextcloud-preview fallback at
 * serve time, it never breaks.
 */
import { eq } from 'drizzle-orm'
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { pathToFileURL } from 'node:url'
import Database from 'postgres'
import sharp from 'sharp'
import { createClient } from 'webdav'
import drizzleConfig from '../../../../drizzle.config'
import { DERIVATIVE_QUALITY, DERIVATIVE_SIZES, derivativePath, isDerivableImage } from '../../images/derivatives'
import * as schema from '../schema'

/**
 * EXIF-oriented pixel size — what browsers display, and the coordinate space
 * topo paths were drawn against. Orientations 5–8 rotate by 90°, so the stored
 * width/height come back swapped. `null` when sharp couldn't read a size.
 */
export const orientedDimensions = (meta: {
  width?: number
  height?: number
  orientation?: number
}): { width: number; height: number } | null => {
  if (meta.width == null || meta.height == null) {
    return null
  }
  const swapped = meta.orientation != null && meta.orientation >= 5
  return swapped ? { width: meta.height, height: meta.width } : { width: meta.width, height: meta.height }
}

/** `/topos/138.jpg` → `/topos` (stored paths always have a leading slash). */
const parentOf = (path: string): string => path.slice(0, path.lastIndexOf('/'))

const nameOf = (path: string): string => path.slice(path.lastIndexOf('/') + 1)

const CONCURRENCY = 4

export const migrate = async (db: PostgresJsDatabase<typeof schema>, { dryRun = false }: { dryRun?: boolean } = {}) => {
  const { NEXTCLOUD_URL, NEXTCLOUD_USER_NAME, NEXTCLOUD_USER_PASSWORD } = process.env
  if (NEXTCLOUD_URL == null || NEXTCLOUD_USER_NAME == null || NEXTCLOUD_USER_PASSWORD == null) {
    throw new Error('NEXTCLOUD_URL / NEXTCLOUD_USER_NAME / NEXTCLOUD_USER_PASSWORD must be set')
  }

  // The app's image access goes through the ImageProvider, but that module reads
  // `$env/static/private` (SvelteKit-only), so this script talks WebDAV directly.
  const dav = createClient(`${NEXTCLOUD_URL}/remote.php/dav/files`, {
    username: NEXTCLOUD_USER_NAME,
    password: NEXTCLOUD_USER_PASSWORD,
  })

  // One PROPFIND per folder instead of one exists() round-trip per derivative.
  // Promise-cached so concurrent workers don't list the same folder twice.
  const listings = new Map<string, Promise<Set<string>>>()
  const listingOf = (dir: string): Promise<Set<string>> => {
    let listing = listings.get(dir)
    if (listing == null) {
      listing = dav
        .getDirectoryContents(`${NEXTCLOUD_USER_NAME}${dir}`)
        .then((entries) => new Set(entries.map((entry) => entry.basename)))
        .catch((err: unknown) => {
          console.warn(`Could not list "${dir}":`, err instanceof Error ? err.message : err)
          return new Set<string>()
        })
      listings.set(dir, listing)
    }
    return listing
  }

  const rows = await db
    .select({ id: schema.files.id, path: schema.files.path, width: schema.files.width, height: schema.files.height })
    .from(schema.files)

  const skipped: Record<string, string[]> = {}
  const skip = (reason: string, ids: string[]) => (skipped[reason] ??= []).push(...ids)

  // `files` contains duplicate rows for the same storage path — download and
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
      buffer = Buffer.from((await dav.getFileContents(`${NEXTCLOUD_USER_NAME}${path}`)) as ArrayBuffer)
    } catch (err) {
      console.warn(`Could not download "${path}":`, err instanceof Error ? err.message : err)
      skip('unreadable image', ids)
      return
    }

    let dims: { width: number; height: number } | null = null
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
        await db.update(schema.files).set({ width: dims.width, height: dims.height }).where(eq(schema.files.id, row.id))
      }
    }

    for (const size of missingSizes) {
      try {
        const webp = await sharp(buffer)
          // Bake the EXIF orientation in — the resized derivative carries no metadata.
          .rotate()
          .resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: DERIVATIVE_QUALITY })
          .toBuffer()
        await dav.putFileContents(`${NEXTCLOUD_USER_NAME}${derivativePath(path, size)}`, webp)
      } catch (err) {
        console.warn(`Could not write ${size}px derivative of "${path}":`, err instanceof Error ? err.message : err)
        skip('derivative failed', ids)
      }
    }
  }

  // Simple worker pool: downloads dominate, sharp encodes are fast — a handful
  // of files in flight saturates the connection without hammering Nextcloud.
  let cursor = 0
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (cursor < paths.length) {
        await processPath(paths[cursor++])
      }
    }),
  )

  console.log(`\n${dryRun ? 'DRY RUN — ' : ''}processed ${processed} of ${paths.length} image path(s).`)
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
