import { bunnyStreams, files } from '$lib/db/schema'
import { createUpdateEvent, insertEvent } from '$lib/entities/event/event.server'
import { formError } from '$lib/forms/schemas'
import type * as z from '$lib/forms/zod'
import type { Context } from '$lib/remote/authed.server'
import { requireRow } from '$lib/remote/require.server'
import { error } from '@sveltejs/kit'
import { eq } from 'drizzle-orm'
import { deleteFileRows, removeFileStorage } from './cleanup.server'
import { mediaWord, type fileVisibilitySchema, type videoSourceSchema } from './dto'
import { requireEditableFile } from './guards.server'
import { fileParent } from './mapper'
import { canDeleteFile } from './permissions'

type FileContext = Pick<Context, 'afterCommit' | 'db' | 'user' | 'userRegions'>

/**
 * Delete one file (its DB row, its Nextcloud images, its Bunny video) from the media
 * viewer. The irreversible storage removal runs after commit, so a failed transaction
 * can never resurrect a row whose bytes are already gone.
 *
 * The server gate (canDeleteFile) is deliberately stricter than the files DELETE RLS,
 * so it pre-checks up front; RLS is still the enforcement (deleteFileRows only removes
 * rows the caller can delete), and an empty result means the row survived, so we report
 * a real 403 instead of a phantom success.
 */
export async function deleteMediaFileRow({ id }: { id: string }, { afterCommit, db, user, userRegions }: FileContext) {
  const file = await requireRow(
    () => db.query.files.findFirst({ where: eq(files.id, id), with: { ascent: { columns: { createdBy: true } } } }),
    (row) =>
      canDeleteFile(userRegions, user.id, {
        ascentCreatedBy: row.ascent?.createdBy ?? undefined,
        regionFk: row.regionFk,
      }),
    formError('files_notFound'),
  )

  const storage = await deleteFileRows(db, [file])
  if (storage.length === 0) {
    // Pre-gate passed but RLS still kept the row (policy drift): fail loudly
    // rather than log a deletion event and toast success for a live file.
    error(403, formError('form_noPermission'))
  }

  // On the PARENT, not the file: the file row is gone by now, and its own upload event went
  // with it through the cascade, so an event naming it would have nothing to point at.
  //
  // Photo or video in `metadata` for the same reason it used to be in `oldValue`: the row
  // that could answer it no longer exists. It also scopes the fold, so clearing three photos
  // off one route in one sitting joins one event rather than stacking three cards that a
  // reader cannot tell apart.
  const parent = fileParent(file)
  if (parent != null) {
    await insertEvent(db, {
      actorFk: user.id,
      metadata: mediaWord(file),
      object: parent,
      regionFk: file.regionFk,
      verb: 'remove',
    })
  }

  afterCommit(() => removeFileStorage(storage))

  return { data: { id } }
}

/**
 * Flip a file between public and private. RLS is the gate: the update only
 * touches a row the caller can edit (the files UPDATE policy, mirrored by
 * canEditFile), so a swallowed update surfaces as a 403 rather than silently
 * doing nothing.
 */
export async function setFileVisibilityRow(
  { fileId, visibility }: z.output<typeof fileVisibilitySchema>,
  { db, user, userRegions }: Pick<FileContext, 'db' | 'user' | 'userRegions'>,
) {
  await requireEditableFile(db, userRegions, user.id, fileId)

  const [updated] = await db.update(files).set({ visibility }).where(eq(files.id, fileId)).returning()
  if (updated == null) {
    error(403, formError('form_noPermission'))
  }
  return { data: updated }
}

/**
 * Change the origin URL credited on a video after the fact. Same gate as the visibility
 * flip (`requireEditableFile`, stricter than the bunny_streams UPDATE RLS for ascent
 * media); RLS is still the enforcement, so a swallowed update surfaces as a 403.
 *
 * The event's object is the FILE, the same way an upload's is: the card then draws the clip
 * the credit is about, and what it hangs on is reachable through the file's own foreign keys.
 */
export async function setVideoSourceRow(
  { fileId, source }: z.output<typeof videoSourceSchema>,
  { db, user, userRegions }: Pick<FileContext, 'db' | 'user' | 'userRegions'>,
) {
  const file = await requireEditableFile(db, userRegions, user.id, fileId)
  if (file.bunnyStreamFk == null) {
    error(400, formError('media_sourceVideoOnly'))
  }

  // Read before writing: the diff needs the value being replaced, and `returning()` can
  // only hand back the one that lands.
  const before = await db.query.bunnyStreams.findFirst({
    columns: { source: true },
    where: eq(bunnyStreams.id, file.bunnyStreamFk),
  })

  const [updated] = await db
    .update(bunnyStreams)
    .set({ source })
    .where(eq(bunnyStreams.id, file.bunnyStreamFk))
    .returning()
  if (updated == null) {
    error(403, formError('form_noPermission'))
  }

  await createUpdateEvent(db, {
    actorFk: user.id,
    newEntity: { source },
    object: { id: file.id, type: 'file' },
    oldEntity: { source: before?.source ?? null },
    regionFk: file.regionFk,
  })

  return { data: updated }
}
