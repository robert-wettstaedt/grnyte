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
 * Idempotent: the MOVE consumes the `.orig` sibling, so a second run finds
 * nothing to do. Nextcloud's trashbin keeps the overwritten resized copy.
 */
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { pathToFileURL } from 'node:url'
import Database from 'postgres'
import { createClient } from 'webdav'
import drizzleConfig from '../../../../drizzle.config'
import { isDerivableImage } from '../../images/derivatives'
import * as schema from '../schema'

/** Storage path of the pristine sibling, e.g. `/topos/138.jpg` → `/topos/138.orig.jpg`. */
const origPathOf = (path: string): string => path.replace(/\.([^./]+)$/, '.orig.$1')

/** `/topos/138.jpg` → `/topos` (stored paths always have a leading slash). */
const parentOf = (path: string): string => path.slice(0, path.lastIndexOf('/'))

const nameOf = (path: string): string => path.slice(path.lastIndexOf('/') + 1)

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

  // One PROPFIND per folder instead of one exists() round-trip per file.
  const listings = new Map<string, Set<string>>()
  const siblingsOf = async (filePath: string): Promise<Set<string>> => {
    const dir = parentOf(filePath)
    const cached = listings.get(dir)
    if (cached != null) {
      return cached
    }

    let names = new Set<string>()
    try {
      const entries = await dav.getDirectoryContents(`${NEXTCLOUD_USER_NAME}${dir}`)
      names = new Set(entries.map((entry) => entry.basename))
    } catch (err) {
      console.warn(`Could not list "${dir}":`, err instanceof Error ? err.message : err)
    }

    listings.set(dir, names)
    return names
  }

  const rows = await db.select({ path: schema.files.path }).from(schema.files)
  // Distinct paths: `files` contains duplicate rows for the same storage path,
  // and the orig can only be promoted once.
  const paths = [...new Set(rows.map((row) => row.path).filter(isDerivableImage))]

  let promoted = 0
  let withoutOrig = 0
  const failed: string[] = []

  for (const path of paths) {
    const orig = origPathOf(path)
    const siblings = await siblingsOf(path)
    if (!siblings.has(nameOf(orig))) {
      withoutOrig += 1
      continue
    }

    console.log(`${dryRun ? 'would promote' : 'promoting'} ${orig} → ${path}`)

    if (!dryRun) {
      try {
        await dav.moveFile(`${NEXTCLOUD_USER_NAME}${orig}`, `${NEXTCLOUD_USER_NAME}${path}`)
        // Keep the cached listing truthful — the orig is consumed now.
        siblings.delete(nameOf(orig))
      } catch (err) {
        failed.push(path)
        console.warn(`Failed to promote "${orig}":`, err instanceof Error ? err.message : err)
        continue
      }
    }
    promoted += 1
  }

  console.log(
    `\n${dryRun ? 'DRY RUN — ' : ''}promoted ${promoted} of ${paths.length} image path(s); ${withoutOrig} had no .orig sibling.`,
  )
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
