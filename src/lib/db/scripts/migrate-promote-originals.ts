/**
 * One-time migration: promote the pristine `.orig` upload over the v1-resized
 * copy. v1 stored some uploads twice: `files.path` points at a resized
 * `<base>.jpg`, while a full-resolution `<base>.orig.jpg` sibling sits next to
 * it in storage, never referenced by the DB. Moving the orig over the main
 * file leaves one pristine source per image. `files.path` stays valid, so
 * there are no DB writes at all (normalized topo paths are ratio-invariant,
 * overlays stay correct).
 *
 * Runs as part of `npm run migrate` (via `migrate.ts`), before
 * migrate-image-derivatives so derivatives are generated from the pristine
 * source. Can also be run on its own to preview:
 *   npx tsx src/lib/db/scripts/migrate-promote-originals.ts --dry-run
 *
 * A `.orig` is only promoted when it is at least as large as the file it replaces. 1.0 data does
 * not always keep that promise (measured on the demo set: 1 pair in 15 had a SMALLER orig), and
 * the MOVE is one-way, so promoting blindly downgrades those images for good. Both files are read
 * to compare, which is why this script downloads at all.
 *
 * Idempotent: the MOVE consumes the `.orig` sibling, so a second run finds
 * nothing to do. Nextcloud's trashbin keeps the overwritten resized copy.
 */
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { pathToFileURL } from 'node:url'
import Database from 'postgres'
import sharp from 'sharp'
import drizzleConfig from '../../../../drizzle.config'
import { isDerivableImage } from '../../images/derivatives'
import * as schema from '../schema'
import { connectNextcloud, inParallel, listingCache, readHead as readHeadOf, rethrowUnlessMissing } from './nextcloud'

/** Storage path of the pristine sibling, e.g. `/topos/138.jpg` → `/topos/138.orig.jpg`. */
const origPathOf = (path: string): string => path.replace(/\.([^./]+)$/, '.orig.$1')

/** `/topos/138.jpg` → `/topos` (stored paths always have a leading slash). */
const parentOf = (path: string): string => path.slice(0, path.lastIndexOf('/'))

const nameOf = (path: string): string => path.slice(path.lastIndexOf('/') + 1)

/** Enough for the SOF marker of every image measured so far; 4KB sufficed for all of them. */
const HEADER_BYTES = 64 * 1024

/** Two round trips per candidate (the compared header reads, then the MOVE) and barely any bytes,
 *  so this is latency-bound: measured against prod, serial was ~9 minutes for 804 candidates. */
const CONCURRENCY = 4

export const migrate = async (db: PostgresJsDatabase<typeof schema>, { dryRun = false }: { dryRun?: boolean } = {}) => {
  const rows = await db.select({ path: schema.files.path }).from(schema.files)
  // Distinct paths: `files` contains duplicate rows for the same storage path,
  // and the orig can only be promoted once.
  const paths = [...new Set(rows.map((row) => row.path).filter(isDerivableImage))]

  // Connect only once there is work: an empty `files` table (a from-scratch DB, CI) must not need
  // reachable storage.
  if (paths.length === 0) {
    return
  }

  const { dav, userPath } = await connectNextcloud()
  const listingOf = listingCache({ dav, userPath })
  const siblingsOf = (filePath: string): Promise<Set<string>> => listingOf(parentOf(filePath))

  const readHead = (p: string): Promise<Buffer> => readHeadOf(dav, userPath(p), HEADER_BYTES)

  // Pixel count, which EXIF orientation cannot change: it only swaps the two factors. Null when
  // the file is gone or unreadable, which the caller treats as "cannot judge".
  const pixelsOf = async (p: string): Promise<null | number> => {
    const dimsFrom = async (buffer: Buffer): Promise<null | number> => {
      try {
        const { height, width } = await sharp(buffer).metadata()
        return width == null || height == null ? null : width * height
      } catch {
        return null
      }
    }

    try {
      // The header carries the dimensions, so a range request avoids pulling every full-size
      // original twice over: migrate-image-derivatives downloads them all again straight after.
      const fromHead = await dimsFrom(await readHead(p))
      if (fromHead != null) {
        return fromHead
      }
      // A header that will not parse (an unusually large EXIF or ICC block): pay for the whole file.
      return await dimsFrom(Buffer.from((await dav.getFileContents(userPath(p))) as ArrayBuffer))
    } catch (err) {
      rethrowUnlessMissing(err)
      return null
    }
  }

  let promoted = 0
  let withoutOrig = 0
  const failed: string[] = []
  const downgrades: string[] = []
  const unjudged: string[] = []

  const processPath = async (path: string) => {
    const orig = origPathOf(path)
    const siblings = await siblingsOf(path)
    if (!siblings.has(nameOf(orig))) {
      withoutOrig += 1
      return
    }

    // 1.0 data does not always keep the promise that `.orig` is the pristine full-resolution copy,
    // and a MOVE is one-way: promoting a smaller one downgrades the image for good, silently.
    const [origPixels, basePixels] = await Promise.all([pixelsOf(orig), pixelsOf(path)])
    if (origPixels == null || basePixels == null) {
      unjudged.push(path)
      console.warn(`Skipping "${orig}": could not read dimensions of both files.`)
      return
    }
    if (origPixels < basePixels) {
      downgrades.push(path)
      console.warn(
        `Skipping "${orig}": it is SMALLER than the file it would replace ` +
          `(${origPixels.toLocaleString()} vs ${basePixels.toLocaleString()} pixels), so promoting it would downgrade the image.`,
      )
      return
    }

    console.log(`${dryRun ? 'would promote' : 'promoting'} ${orig} → ${path}`)

    if (!dryRun) {
      try {
        await dav.moveFile(userPath(orig), userPath(path))
        // Keep the cached listing truthful: the orig is consumed now.
        siblings.delete(nameOf(orig))
      } catch (err) {
        failed.push(path)
        console.warn(`Failed to promote "${orig}":`, err instanceof Error ? err.message : err)
        return
      }
    }
    promoted += 1
  }

  // Each path owns its own `.orig`, so the work is independent; what is shared is the
  // promise-cached folder listing, which is built for concurrent callers.
  await inParallel(paths, CONCURRENCY, processPath)

  console.log(
    `\n${dryRun ? 'DRY RUN: ' : ''}promoted ${promoted} of ${paths.length} image path(s); ${withoutOrig} had no .orig sibling.`,
  )
  if (downgrades.length > 0) {
    console.log(`Kept the existing file, .orig was smaller (${downgrades.length}): ${downgrades.join(', ')}`)
  }
  if (unjudged.length > 0) {
    console.log(`Skipped, dimensions unreadable (${unjudged.length}): ${unjudged.join(', ')}`)
  }
  if (failed.length > 0) {
    console.log(`Failed: ${failed.join(', ')}`)
  }
}

// Standalone preview: `npx tsx src/lib/db/scripts/migrate-promote-originals.ts [--dry-run]`.
if (process.argv[1] != null && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const postgres = Database(drizzleConfig.dbCredentials.url, { prepare: false })
  await migrate(drizzle(postgres, { schema }), { dryRun: process.argv.includes('--dry-run') })
  await postgres.end()
}
