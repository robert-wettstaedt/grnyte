import { command } from '$app/server'
import * as schema from '$lib/db/schema'
import { bunnyStreams, files, type File } from '$lib/db/schema'
import { insertEvent } from '$lib/entities/event/event.server'
import { formError } from '$lib/forms/schemas'
import * as z from '$lib/forms/zod'
import { DERIVATIVE_QUALITY, DERIVATIVE_SIZES, derivativePath, orientedDimensions } from '$lib/images/derivatives'
import { getImageProvider } from '$lib/images/provider.server'
import { logServerFailure } from '$lib/logging/failure.server'
import { stringifyError } from '$lib/logging/stringify'
import { authedCommand, authedRls, requireAuthed } from '$lib/remote/authed.server'
import type { MutationResult } from '$lib/remote/mutation'
import { getVideoProvider } from '$lib/videos/provider.server'
import { createId as createCuid2 } from '@paralleldrive/cuid2'
import { error, isHttpError } from '@sveltejs/kit'
import { eq } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import heicConvert from 'heic-convert'
import sharp from 'sharp'
import { deleteFileSchema, fileVisibilitySchema, sourceUrl, videoSourceSchema } from './dto'
import { deleteMediaFileRow, setFileVisibilityRow, setVideoSourceRow } from './edit.server'
import { resolveAttachRegion } from './guards.server'
import { extensionOf, fileEntityTypes, isHeic, isImageFileName, STAGING_BUCKET, type FileEntityType } from './upload'

/** The FK column linking a `files` row to its target entity: mirrors the columns on `files`. */
const entityFks = (type: FileEntityType, id: number) => ({
  areaFk: type === 'area' ? id : undefined,
  ascentFk: type === 'ascent' ? id : undefined,
  blockFk: type === 'block' ? id : undefined,
  routeFk: type === 'route' ? id : undefined,
})

/**
 * Log an upload. The event's object is the FILE, which is the opposite way round from the delete
 * below, where the file is gone by the time the feed reads it and only the parent is left to
 * name. What the file landed on is reachable through `files.route_fk`/`ascent_fk`, which is what
 * the old row's `parentEntity*` pair was standing in for.
 *
 * One event per file, so removing one photo takes exactly its own card and nothing else. A submit
 * finalizes each image separately anyway, so there is no batch here to collapse.
 *
 * Blocks are the exception, and log nothing here: every image attached to a block is a topo
 * image (the topo editor is the only caller that finalizes one), and the `createTopo` or
 * `replaceTopoImage` that follows says strictly more about the same upload, naming the photo and
 * the topo action and drawing the image with its lines. Both would otherwise reach the feed as
 * two cards for one upload. Give a block a photo that is NOT a topo and this is what has to
 * change.
 */
const insertUploadEvent = (
  db: PostgresJsDatabase<typeof schema>,
  { entityType, fileId, regionFk, userFk }: UploadEventTarget,
) =>
  entityType === 'block'
    ? undefined
    : insertEvent(db, {
        actorFk: userFk,
        object: { id: fileId, type: 'file' },
        regionFk,
        verb: 'add',
      })

interface UploadEventTarget {
  /** Only to spot the topo case: the file's own row is what names what it hangs on. */
  entityType: FileEntityType
  fileId: string
  regionFk: number
  userFk: number
}

const finalizeImageSchema = z.object({
  entityId: z.number(),
  entityType: z.enum(fileEntityTypes),
  /** Path within the staging bucket the browser uploaded to (see `stagingPath`). */
  stagingPath: z.string().check(z.minLength(1)),
})

/**
 * Server side of the image upload flow: move a staged upload out of the
 * Supabase staging bucket into image storage (original + webp derivatives) and
 * attach it to an entity as a `files` row.
 *
 * RLS scopes both sides: the staging download only succeeds inside the
 * caller's own uid folder, and the `files` insert requires read permission in
 * the entity's region, so there are no explicit permission checks here.
 * The staged object is claimed first (an atomic move), so a double submit cannot insert twice.
 * Any throw before the insert moves it back; a leftover claim is swept with the staging objects.
 */
export const finalizeImage = command(
  finalizeImageSchema,
  async ({ entityId, entityType, stagingPath }): Promise<MutationResult<File>> => {
    // Hand-wired auth + RLS instead of authedCommand: this pipeline is dominated
    // by storage work (staging download, HEIC convert, sharp encodes, WebDAV
    // PUTs), which must not run inside authedCommand's handler-wide transaction
    // holding a pooled connection: DB access happens in the two short `rls`
    // transactions below instead.
    const { rls, supabase, user, userRegions } = await authedRls()

    if (!isImageFileName(stagingPath)) {
      error(400, formError('upload_invalidType'))
    }

    const regionFk = await rls((db) => resolveAttachRegion(db, user.id, userRegions, entityType, entityId))

    // Only one caller wins the move; the loser (or a retry after success) sees the object missing.
    const staging = supabase.storage.from(STAGING_BUCKET)
    const claimedPath = `${stagingPath}.claimed`
    const claim = await staging.move(stagingPath, claimedPath)
    if (claim.error != null) {
      error(400, formError('upload_stagedMissing'))
    }
    const release = () => staging.move(claimedPath, stagingPath).catch(() => {})

    const provider = getImageProvider()
    const stored: string[] = []
    const store = async (target: string, data: Buffer) => {
      await provider.store(target, data)
      stored.push(target)
    }

    let file: File
    try {
      const download = await staging.download(claimedPath)
      if (download.error != null) {
        error(400, formError('upload_stagedMissing'))
      }

      const uploaded = await download.data.arrayBuffer()
      let buffer = Buffer.from(uploaded)
      let extension = /\.([^./]+)$/.exec(stagingPath)![1].toLowerCase()

      // sharp's prebuilt binaries can't decode HEIC and browsers can't display it,
      // so an iPhone photo becomes a max-quality JPEG original.
      if (isHeic(stagingPath)) {
        try {
          buffer = Buffer.from(await heicConvert({ buffer, format: 'JPEG', quality: 1 }))
        } catch {
          error(400, formError('upload_unreadableImage'))
        }
        extension = 'jpg'
      }

      const dimensions = orientedDimensions(
        await sharp(buffer)
          .metadata()
          .catch(() => ({})),
      )
      if (dimensions == null) {
        error(400, formError('upload_unreadableImage'))
      }

      // Ascent media lives under the uploader's folder; everything else is topo imagery.
      // The row id doubles as the storage file name so the two are matchable both ways.
      const id = createCuid2()
      const folder = entityType === 'ascent' ? `/user-content/${user.authUserFk}` : '/topos'
      const path = `${folder}/${id}.${extension}`

      await store(path, buffer)
      // The app serves the JPEG, but the pristine HEIC is kept as an `.orig.*`
      // sibling (the migrate-promote-originals convention, never derivatized).
      if (isHeic(stagingPath)) {
        await store(`${folder}/${id}.orig.${extensionOf(stagingPath)}`, Buffer.from(uploaded))
      }
      for (const size of DERIVATIVE_SIZES) {
        const webp = await sharp(buffer)
          // Bake the EXIF orientation in: the resized derivative carries no metadata.
          .rotate()
          .resize({ fit: 'inside', height: size, width: size, withoutEnlargement: true })
          .webp({ quality: DERIVATIVE_QUALITY })
          .toBuffer()
        await store(derivativePath(path, size), webp)
      }

      // A short RLS transaction of its own: the storage work above must not
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

        await insertUploadEvent(db, { entityType, fileId: id, regionFk, userFk: user.id })

        return rows
      })
      file = inserted
    } catch (cause) {
      // Any throw before the commit: unwind image storage and hand the upload back. shortcut: a
      // timeout throws nothing, so its retry asks for a re-upload; fix only with proof of no insert.
      await Promise.allSettled([...stored.map((target) => provider.remove(target)), release()])
      throw cause
    }

    // Only once the insert has committed: drop the claimed source. supabase-js
    // reports failures as a return value, so at worst this leaves an orphan,
    // swept later by POST /api/tasks/cleanup (staging objects > 24h).
    await staging.remove([claimedPath])

    return { data: file }
  },
)

/**
 * First half of the video upload flow: create the video object at the host
 * (grouped under the caller's collection) and presign its upload, which the
 * browser then runs directly against the host. Plain `command` with a
 * hand-wired auth gate: pure video-host API round-trips that must not hold a
 * pooled connection (authedCommand wraps the handler in an RLS transaction).
 * Region permissions are checked at finalize; worst case an authed user
 * creates orphaned empty video objects, swept later by
 * POST /api/tasks/cleanup (still placeholder-titled Bunny videos > 48h).
 */
export const createBunnyVideo = command(async () => {
  const { user } = requireAuthed()
  return getVideoProvider().createUpload(user.authUserFk)
})

// The bodies live in `edit.server.ts`, shared with the file mutators. The `/f` share page keeps
// `setFileVisibility` and `deleteFile`: it renders outside `(app)`, with no Zero client.

export const setFileVisibility = authedCommand(fileVisibilitySchema, (args, ctx) => setFileVisibilityRow(args, ctx))

/** @public Unused since the mutators; deployed one more release for tabs loaded before them. */
export const setVideoSource = authedCommand(videoSourceSchema, (args, ctx) => setVideoSourceRow(args, ctx))

export const deleteFile = authedCommand(deleteFileSchema, (args, ctx) => deleteMediaFileRow(args, ctx))

const finalizeVideoSchema = z.object({
  entityId: z.number(),
  entityType: z.enum(fileEntityTypes),
  /** Where the clip was grabbed from (route uploads only), credited on the route page. */
  source: z.optional(sourceUrl),
  /** Ownership proof minted by `createBunnyVideo` alongside the GUID. */
  token: z.string(),
  /** Bunny video GUID: doubles as the `bunnyStreams` row id. */
  videoId: z.uuid(),
})

/**
 * Second half: attach a fully-uploaded Bunny video to an entity (an ascent
 * clip, a route beta video, …). Unlike `finalizeImage` there is no storage
 * work (the client awaited TUS completion and Bunny already has the bytes)
 * so a standard authedCommand (one RLS transaction, atomic rollback) fits.
 */
export const finalizeVideo = authedCommand(
  finalizeVideoSchema,
  async (
    { entityId, entityType, source, token, videoId },
    { db, user, userRegions },
  ): Promise<MutationResult<File>> => {
    // The GUID is client-supplied: the token proves this user created this
    // video via createBunnyVideo, so made-up or foreign GUIDs can't be attached.
    if (!getVideoProvider().verifyUpload(videoId, user.authUserFk, token)) {
      error(403, formError('media_unknownVideo'))
    }

    try {
      // Same gate as finalizeImage: pre-check so it fails with a real message instead of an
      // opaque RLS rollback after two inserts.
      const regionFk = await resolveAttachRegion(db, user.id, userRegions, entityType, entityId)
      // files.bunnyStreamFk and bunnyStreams.fileFk are circular, and the
      // bunny_streams UPDATE policy can never pass a NULL -> value file_fk
      // transition (its USING clause requires file_fk to already point at an
      // own-ascent file). So: insert the file first (path '': the convention
      // for video rows; the media lives at Bunny), insert the stream row with
      // file_fk already set, then complete the link on files: whose
      // own-ascent/EDIT update policies do pass.
      const [file] = await db
        .insert(files)
        .values({ createdBy: user.id, path: '', regionFk, ...entityFks(entityType, entityId) })
        .returning()
      await db.insert(bunnyStreams).values({ fileFk: file.id, id: videoId, regionFk, source })
      const [linked] = await db.update(files).set({ bunnyStreamFk: videoId }).where(eq(files.id, file.id)).returning()

      await insertUploadEvent(db, { entityType, fileId: file.id, regionFk, userFk: user.id })

      if (linked == null) {
        // Safety net: the checks above should make this unreachable; if RLS
        // still swallows the update, roll the whole attach back rather than
        // leave a file without its video.
        error(403, formError('form_noPermission'))
      }
      return { data: linked }
    } catch (thrown) {
      // A refusal strands Bunny's copy (the sweeper skips videos past status 0), so take it back; a
      // fault keeps it for the client's retry, and a failed DELETE is logged, never thrown over the 403.
      if (isHttpError(thrown)) {
        await getVideoProvider()
          .remove(videoId)
          .catch(async (reclaimFailed) => {
            // An unreclaimed video is a paid asset nothing sweeps up, and this is its only trace.
            console.error('[finalizeVideo] reclaim failed', videoId, reclaimFailed)
            await logServerFailure('finalizeVideo', `reclaim failed for ${videoId}: ${stringifyError(reclaimFailed)}`)
          })
      }
      throw thrown
    }
  },
)
