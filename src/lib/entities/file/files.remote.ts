import { command, getRequestEvent } from '$app/server'
import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import * as schema from '$lib/db/schema'
import { bunnyStreams, files, type File } from '$lib/db/schema'
import { insertActivity } from '$lib/entities/activity/activity.server'
import { DERIVATIVE_QUALITY, DERIVATIVE_SIZES, derivativePath, orientedDimensions } from '$lib/images/derivatives'
import { getImageProvider } from '$lib/images/provider.server'
import { authedCommand } from '$lib/remote/authed.server'
import type { MutationResult } from '$lib/remote/mutation'
import { getVideoProvider } from '$lib/videos/provider.server'
import { createId as createCuid2 } from '@paralleldrive/cuid2'
import { error } from '@sveltejs/kit'
import { eq } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import heicConvert from 'heic-convert'
import sharp from 'sharp'
import z from 'zod'
import { deleteFileRows, removeFileStorage } from './cleanup.server'
import { requireEditableFile, resolveAttachRegion } from './guards.server'
import { canDeleteFile } from './permissions'
import { extensionOf, fileEntityTypes, isHeic, isImageFileName, STAGING_BUCKET, type FileEntityType } from './upload'

/** The FK column linking a `files` row to its target entity — mirrors the columns on `files`. */
const entityFks = (type: FileEntityType, id: number) => ({
  areaFk: type === 'area' ? id : undefined,
  ascentFk: type === 'ascent' ? id : undefined,
  blockFk: type === 'block' ? id : undefined,
  routeFk: type === 'route' ? id : undefined,
})

/**
 * Log an upload. The row points at the FILE (`entityType: 'file'`) and names the entity it
 * was attached to as its parent, which is the opposite way round from the delete below,
 * where the file is gone by the time the feed reads it and only the parent is left to name.
 *
 * The parent is what the feed groups and titles on ("added photos to Nordblock"), so several
 * images from one submit fold into a single card rather than one card each.
 *
 * ponytail: one row per file. A submit finalizes each image separately anyway, so there is no
 * batch to collapse here. Upgrade = a count in `metadata` if the row volume ever bites.
 */
const insertUploadActivity = (
  db: PostgresJsDatabase<typeof schema>,
  { entityId, entityType, fileId, regionFk, userFk }: UploadActivity,
) =>
  insertActivity(db, {
    entityId: fileId,
    entityType: 'file',
    parentEntityId: entityId,
    parentEntityType: entityType,
    regionFk,
    type: 'uploaded',
    userFk,
  })

interface UploadActivity {
  entityId: number
  entityType: FileEntityType
  fileId: string
  regionFk: number
  userFk: number
}

const finalizeImageSchema = z.object({
  entityId: z.number(),
  entityType: z.enum(fileEntityTypes),
  /** Path within the staging bucket the browser uploaded to (see `stagingPath`). */
  stagingPath: z.string().min(1),
})

/**
 * Server side of the image upload flow: move a staged upload out of the
 * Supabase staging bucket into image storage (original + webp derivatives) and
 * attach it to an entity as a `files` row.
 *
 * RLS scopes both sides — the staging download only succeeds inside the
 * caller's own uid folder, and the `files` insert requires read permission in
 * the entity's region — so there are no explicit permission checks here.
 * Ordering makes it retryable: the staging object is deleted last, so any
 * failure before that leaves it in place for another attempt.
 */
export const finalizeImage = command(
  finalizeImageSchema,
  async ({ entityId, entityType, stagingPath }): Promise<MutationResult<File>> => {
    // Hand-wired auth + RLS instead of authedCommand: this pipeline is dominated
    // by storage work (staging download, HEIC convert, sharp encodes, WebDAV
    // PUTs), which must not run inside authedCommand's handler-wide transaction
    // holding a pooled connection — DB access happens in the two short `rls`
    // transactions below instead.
    const { supabase, user, userRegions } = getRequestEvent().locals
    if (user == null) {
      error(401, 'Not authenticated')
    }
    const rls = await createDrizzleSupabaseClient(supabase)

    if (!isImageFileName(stagingPath)) {
      error(400, 'Unsupported image format')
    }

    const regionFk = await rls((db) => resolveAttachRegion(db, user.id, userRegions, entityType, entityId))

    const download = await supabase.storage.from(STAGING_BUCKET).download(stagingPath)
    if (download.error != null) {
      error(400, 'Uploaded file not found')
    }

    const uploaded = await download.data.arrayBuffer()
    let buffer = Buffer.from(uploaded)
    let extension = /\.([^./]+)$/.exec(stagingPath)![1].toLowerCase()

    // sharp's prebuilt binaries can't decode HEIC and browsers can't display it,
    // so an iPhone photo becomes a max-quality JPEG original.
    if (isHeic(stagingPath)) {
      try {
        buffer = Buffer.from(await heicConvert({ buffer: uploaded, format: 'JPEG', quality: 1 }))
      } catch {
        error(400, 'Not a readable image')
      }
      extension = 'jpg'
    }

    const dimensions = orientedDimensions(
      await sharp(buffer)
        .metadata()
        .catch(() => ({})),
    )
    if (dimensions == null) {
      error(400, 'Not a readable image')
    }

    // Ascent media lives under the uploader's folder; everything else is topo imagery.
    // The row id doubles as the storage file name so the two are matchable both ways.
    const id = createCuid2()
    const folder = entityType === 'ascent' ? `/user-content/${user.authUserFk}` : '/topos'
    const path = `${folder}/${id}.${extension}`
    const provider = getImageProvider()
    const stored: string[] = []
    const store = async (target: string, data: Buffer) => {
      await provider.store(target, data)
      stored.push(target)
    }

    let file: File
    try {
      await store(path, buffer)
      // The app serves the JPEG, but the pristine HEIC is kept as an `.orig.*`
      // sibling (the migrate-promote-originals convention — never derivatized).
      if (isHeic(stagingPath)) {
        await store(`${folder}/${id}.orig.${extensionOf(stagingPath)}`, Buffer.from(uploaded))
      }
      for (const size of DERIVATIVE_SIZES) {
        const webp = await sharp(buffer)
          // Bake the EXIF orientation in — the resized derivative carries no metadata.
          .rotate()
          .resize({ fit: 'inside', height: size, width: size, withoutEnlargement: true })
          .webp({ quality: DERIVATIVE_QUALITY })
          .toBuffer()
        await store(derivativePath(path, size), webp)
      }

      // A short RLS transaction of its own — the storage work above must not
      // hold a pooled connection (a submit finalizes several images at once).
      const [inserted] = await rls(async (db) => {
        const rows = await db
          .insert(files)
          .values({
            createdBy: user.id,
            height: dimensions.height,
            id,
            path,
            regionFk,
            width: dimensions.width,
            ...entityFks(entityType, entityId),
          })
          .returning()

        await insertUploadActivity(db, { entityId, entityType, fileId: id, regionFk, userFk: user.id })

        return rows
      })
      file = inserted
    } catch (cause) {
      // Best-effort: unwind whatever landed in image storage so retries (which
      // mint a fresh id) don't accumulate orphans. The staged object is still
      // in place, so the upload remains retryable.
      await Promise.allSettled(stored.map((target) => provider.remove(target)))
      throw cause
    }

    // Only once the insert has committed: drop the staged source. supabase-js
    // reports failures as a return value, so at worst this leaves an orphan,
    // swept later by POST /api/tasks/cleanup-uploads (staging objects > 24h).
    await supabase.storage.from(STAGING_BUCKET).remove([stagingPath])

    return { data: file }
  },
)

/**
 * First half of the video upload flow: create the video object at the host
 * (grouped under the caller's collection) and presign its upload, which the
 * browser then runs directly against the host. Plain `command` with a
 * hand-wired auth gate — pure video-host API round-trips that must not hold a
 * pooled connection (authedCommand wraps the handler in an RLS transaction).
 * Region permissions are checked at finalize; worst case an authed user
 * creates orphaned empty video objects, swept later by
 * POST /api/tasks/cleanup-uploads (still placeholder-titled Bunny videos > 48h).
 */
export const createBunnyVideo = command(async () => {
  const { user } = getRequestEvent().locals
  if (user == null) {
    error(401, 'Not authenticated')
  }
  return getVideoProvider().createUpload(user.authUserFk)
})

/**
 * Flip a file between public and private. RLS is the gate: the update only
 * touches a row the caller can edit (the files UPDATE policy, mirrored by
 * canEditFile), so a swallowed update surfaces as a 403 rather than silently
 * doing nothing.
 */
export const setFileVisibility = authedCommand(
  z.object({ fileId: z.string().min(1), visibility: z.enum(['public', 'private']) }),
  async ({ fileId, visibility }, { db, user, userRegions }): Promise<MutationResult<File>> => {
    await requireEditableFile(db, userRegions, user.id, fileId)

    const [updated] = await db.update(files).set({ visibility }).where(eq(files.id, fileId)).returning()
    if (updated == null) {
      error(403, 'Not allowed to change this file')
    }
    return { data: updated }
  },
)

/**
 * Delete one file (its DB row, its Nextcloud images, its Bunny video) from the media
 * viewer. Hand-wired like finalizeImage rather than authedCommand: the irreversible
 * storage removal must run only AFTER the DB delete commits, so a mid-transaction
 * failure can never resurrect a row whose bytes are already gone.
 *
 * The server gate (canDeleteFile) is deliberately stricter than the files DELETE RLS,
 * so it pre-checks up front; RLS is still the enforcement (deleteFileRows only removes
 * rows the caller can delete), and an empty result means the row survived, so we report
 * a real 403 instead of a phantom success.
 */
export const deleteFile = command(
  z.object({ id: z.string().min(1) }),
  async ({ id }): Promise<MutationResult<{ id: string }>> => {
    const { supabase, user, userRegions } = getRequestEvent().locals
    if (user == null) {
      error(401, 'Not authenticated')
    }
    const rls = await createDrizzleSupabaseClient(supabase)

    const storage = await rls(async (db) => {
      const file = await db.query.files.findFirst({
        where: eq(files.id, id),
        with: { ascent: { columns: { createdBy: true } } },
      })
      if (file == null) {
        error(404, 'File not found')
      }

      const canDelete = canDeleteFile(userRegions, user.id, {
        ascentCreatedBy: file.ascent?.createdBy ?? undefined,
        regionFk: file.regionFk,
      })
      if (!canDelete) {
        error(403, 'Not allowed to delete this file')
      }

      const storage = await deleteFileRows(db, [file])
      if (storage.length === 0) {
        // Pre-gate passed but RLS still kept the row (policy drift): fail loudly
        // rather than log a deletion activity and toast success for a live file.
        error(403, 'Not allowed to delete this file')
      }

      const entityId = file.routeFk ?? file.ascentFk ?? file.blockFk ?? file.areaFk
      const entityType =
        file.routeFk != null ? 'route' : file.ascentFk != null ? 'ascent' : file.blockFk != null ? 'block' : 'area'

      if (entityId != null) {
        await insertActivity(db, {
          columnName: 'file',
          entityId,
          entityType,
          regionFk: file.regionFk,
          type: 'deleted',
          userFk: user.id,
        })
      }

      return storage
    })

    // Only now that the row deletion has committed: destroy the backing bytes.
    await removeFileStorage(storage)

    return { data: { id } }
  },
)

const finalizeVideoSchema = z.object({
  entityId: z.number(),
  entityType: z.enum(fileEntityTypes),
  /** Where the clip was grabbed from (route uploads only), credited on the route page. */
  source: z.url().max(500).optional(),
  /** Ownership proof minted by `createBunnyVideo` alongside the GUID. */
  token: z.string(),
  /** Bunny video GUID — doubles as the `bunnyStreams` row id. */
  videoId: z.uuid(),
})

/**
 * Second half: attach a fully-uploaded Bunny video to an entity (an ascent
 * clip, a route beta video, …). Unlike `finalizeImage` there is no storage
 * work — the client awaited TUS completion and Bunny already has the bytes —
 * so a standard authedCommand (one RLS transaction, atomic rollback) fits.
 */
export const finalizeVideo = authedCommand(
  finalizeVideoSchema,
  async (
    { entityId, entityType, source, token, videoId },
    { db, user, userRegions },
  ): Promise<MutationResult<File>> => {
    // The GUID is client-supplied — the token proves this user created this
    // video via createBunnyVideo, so made-up or foreign GUIDs can't be attached.
    if (!getVideoProvider().verifyUpload(videoId, user.authUserFk, token)) {
      error(403, 'Unknown video')
    }

    // Same gate as finalizeImage: pre-check so it fails with a real message instead of an
    // opaque RLS rollback after two inserts.
    const regionFk = await resolveAttachRegion(db, user.id, userRegions, entityType, entityId)

    // files.bunnyStreamFk and bunnyStreams.fileFk are circular, and the
    // bunny_streams UPDATE policy can never pass a NULL -> value file_fk
    // transition (its USING clause requires file_fk to already point at an
    // own-ascent file). So: insert the file first (path '' — the convention
    // for video rows; the media lives at Bunny), insert the stream row with
    // file_fk already set, then complete the link on files — whose
    // own-ascent/EDIT update policies do pass.
    const [file] = await db
      .insert(files)
      .values({ createdBy: user.id, path: '', regionFk, ...entityFks(entityType, entityId) })
      .returning()
    await db.insert(bunnyStreams).values({ fileFk: file.id, id: videoId, regionFk, source })
    const [linked] = await db.update(files).set({ bunnyStreamFk: videoId }).where(eq(files.id, file.id)).returning()

    await insertUploadActivity(db, { entityId, entityType, fileId: file.id, regionFk, userFk: user.id })

    if (linked == null) {
      // Safety net — the checks above should make this unreachable; if RLS
      // still swallows the update, roll the whole attach back rather than
      // leave a file without its video.
      error(403, 'Not allowed to attach videos here')
    }
    return { data: linked }
  },
)
