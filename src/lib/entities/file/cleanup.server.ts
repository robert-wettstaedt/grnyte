import * as schema from '$lib/db/schema'
import { bunnyStreams, files, type File } from '$lib/db/schema'
import { imageStoragePaths } from '$lib/images/derivatives'
import { getImageProvider } from '$lib/images/provider.server'
import { getVideoProvider } from '$lib/videos/provider.server'
import { inArray } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'

/**
 * A deleted file's backing storage: a hosted video, or the image objects (served
 * original, webp derivatives, orig sibling). Produced by {@link deleteFileRows},
 * consumed by {@link removeFileStorage} once the DB delete has committed.
 */
export type FileStorageTarget = { images: string[] } | { video: string }

/** The columns {@link deleteFileRows} needs to unwind a row from storage. */
type DeletableFile = Pick<File, 'bunnyStreamFk' | 'id' | 'path'>

/**
 * Delete file rows (and their bunny_streams) inside the caller's RLS transaction and
 * return the storage targets for the rows deleted. Pass the rows already
 * fetched (the caller usually loaded them to permission-check anyway); their pre-unlink
 * `bunnyStreamFk` is what points at the hosted video.
 *
 * A hard delete, deliberately, even though ascents and crag entities tombstone. An upload
 * is one event per file, so cascading `events.file_fk` removes exactly the card for the
 * photo that went and nothing else. Tombstoning instead would strand every parent: every
 * `files.*_fk` is ON DELETE NO ACTION, so a surviving row pins the ascent, route, block or
 * area it hangs off and their own deletes fail on it.
 *
 * Storage is deliberately NOT touched here. Removing the hosted bytes is irreversible,
 * so it must run only after the transaction commits (see {@link removeFileStorage});
 * otherwise a later failure in the same transaction rolls the rows back but leaves a
 * live row pointing at media that is already gone. What comes back from `returning` is
 * the source of truth: a row RLS silently kept keeps its bytes too.
 */
export async function deleteFileRows(
  db: PostgresJsDatabase<typeof schema>,
  rows: DeletableFile[],
): Promise<FileStorageTarget[]> {
  if (rows.length === 0) {
    return []
  }

  const ids = rows.map((row) => row.id)
  // files.bunnyStreamFk and bunnyStreams.fileFk are circular, and the bunny_streams
  // DELETE policy joins through a still-existing file: unlink the files, delete the
  // streams, then delete the files.
  await db.update(files).set({ bunnyStreamFk: null }).where(inArray(files.id, ids))
  await db.delete(bunnyStreams).where(inArray(bunnyStreams.fileFk, ids))

  const deleted = await db.delete(files).where(inArray(files.id, ids)).returning({ id: files.id })

  const deletedIds = new Set(deleted.map((row) => row.id))
  return rows
    .filter((row) => deletedIds.has(row.id))
    .map((row) =>
      row.bunnyStreamFk != null
        ? { video: row.bunnyStreamFk }
        : { images: row.path !== '' ? imageStoragePaths(row.path) : [] },
    )
}

/**
 * Best-effort removal of the backing storage for already-deleted rows. Runs after the
 * DB commit and never throws (a failed remove leaves an orphan for a cleanup cron rather
 * than resurrecting the row), but logs each failure so the orphan is discoverable now
 * that its DB row is gone.
 */
export async function removeFileStorage(targets: FileStorageTarget[]): Promise<void> {
  if (targets.length === 0) {
    return
  }

  const image = getImageProvider()
  const video = getVideoProvider()
  const results = await Promise.allSettled(
    targets.flatMap((target) =>
      'video' in target ? [video.remove(target.video)] : target.images.map((path) => image.remove(path)),
    ),
  )
  for (const result of results) {
    if (result.status === 'rejected') {
      console.error('[cleanup] failed to remove file storage', result.reason)
    }
  }
}
