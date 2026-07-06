import { command, getRequestEvent } from '$app/server'
import { checkRegionPermission, REGION_PERMISSION_EDIT } from '$lib/auth'
import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import { bunnyStreams, files, type File } from '$lib/db/schema'
import { DERIVATIVE_QUALITY, DERIVATIVE_SIZES, derivativePath, orientedDimensions } from '$lib/images/derivatives'
import { getImageProvider } from '$lib/images/provider.server'
import { authedCommand, type Context } from '$lib/remote/authed.server'
import { getVideoProvider } from '$lib/videos/provider.server'
import type { MutationResult } from '$lib/remote/mutation'
import { createId as createCuid2 } from '@paralleldrive/cuid2'
import { error } from '@sveltejs/kit'
import { eq } from 'drizzle-orm'
import heicConvert from 'heic-convert'
import sharp from 'sharp'
import z from 'zod'
import { extensionOf, fileEntityTypes, isHeic, isImageFileName, STAGING_BUCKET, type FileEntityType } from './upload'

/**
 * Region of the target entity. 403s when someone else's ascent is targeted —
 * ascent media is personal, and the files INSERT policy is only region-scoped
 * (unlike the owner-scoped update/delete policies), so RLS won't catch it.
 */
const regionOf = async (
  db: Context['db'],
  user: Context['user'],
  type: FileEntityType,
  id: number,
): Promise<number | undefined> => {
  if (type === 'ascent') {
    const ascent = await db.query.ascents.findFirst({
      columns: { regionFk: true, createdBy: true },
      where: (ascents) => eq(ascents.id, id),
    })
    if (ascent != null && ascent.createdBy !== user.id) {
      error(403, 'Only the ascent author can attach media to it')
    }
    return ascent?.regionFk
  }
  const columns = { regionFk: true } as const
  const entity = await (type === 'area'
    ? db.query.areas.findFirst({ columns, where: (areas) => eq(areas.id, id) })
    : type === 'block'
      ? db.query.blocks.findFirst({ columns, where: (blocks) => eq(blocks.id, id) })
      : db.query.routes.findFirst({ columns, where: (routes) => eq(routes.id, id) }))
  return entity?.regionFk
}

/** The FK column linking a `files` row to its target entity — mirrors the columns on `files`. */
const entityFks = (type: FileEntityType, id: number) => ({
  areaFk: type === 'area' ? id : undefined,
  ascentFk: type === 'ascent' ? id : undefined,
  blockFk: type === 'block' ? id : undefined,
  routeFk: type === 'route' ? id : undefined,
})

const finalizeImageSchema = z.object({
  /** Path within the staging bucket the browser uploaded to (see `stagingPath`). */
  stagingPath: z.string().min(1),
  entityType: z.enum(fileEntityTypes),
  entityId: z.number(),
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
  async ({ stagingPath, entityType, entityId }): Promise<MutationResult<File>> => {
    // Hand-wired auth + RLS instead of authedCommand: this pipeline is dominated
    // by storage work (staging download, HEIC convert, sharp encodes, WebDAV
    // PUTs), which must not run inside authedCommand's handler-wide transaction
    // holding a pooled connection — DB access happens in the two short `rls`
    // transactions below instead.
    const { user, supabase } = getRequestEvent().locals
    if (user == null) {
      error(401, 'Not authenticated')
    }
    const rls = await createDrizzleSupabaseClient(supabase)

    if (!isImageFileName(stagingPath)) {
      error(400, 'Unsupported image format')
    }

    const regionFk = await rls((db) => regionOf(db, user, entityType, entityId))
    if (regionFk == null) {
      error(404, `${entityType} not found`)
    }

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
          .resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: DERIVATIVE_QUALITY })
          .toBuffer()
        await store(derivativePath(path, size), webp)
      }

      // A short RLS transaction of its own — the storage work above must not
      // hold a pooled connection (a submit finalizes several images at once).
      const [inserted] = await rls((db) =>
        db
          .insert(files)
          .values({
            id,
            path,
            width: dimensions.width,
            height: dimensions.height,
            regionFk,
            ...entityFks(entityType, entityId),
          })
          .returning(),
      )
      file = inserted
    } catch (cause) {
      // Best-effort: unwind whatever landed in image storage so retries (which
      // mint a fresh id) don't accumulate orphans. The staged object is still
      // in place, so the upload remains retryable.
      await Promise.allSettled(stored.map((target) => provider.remove(target)))
      throw cause
    }

    // Only once the insert has committed: drop the staged source. supabase-js
    // reports failures as a return value, so at worst this leaves an orphan;
    // ponytail: a cleanup cron for staging objects older than 24h is the
    // upgrade when orphans accumulate.
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
 * creates orphaned empty video objects — ponytail: cleanup cron territory,
 * same as staging orphans.
 */
export const createBunnyVideo = command(async () => {
  const { user } = getRequestEvent().locals
  if (user == null) {
    error(401, 'Not authenticated')
  }
  return getVideoProvider().createUpload(user.authUserFk)
})

const finalizeVideoSchema = z.object({
  /** Bunny video GUID — doubles as the `bunnyStreams` row id. */
  videoId: z.uuid(),
  /** Ownership proof minted by `createBunnyVideo` alongside the GUID. */
  token: z.string(),
  entityType: z.enum(fileEntityTypes),
  entityId: z.number(),
  /** Where the clip was grabbed from (route uploads only), credited on the route page. */
  source: z.url().max(500).optional(),
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
    { videoId, token, entityType, entityId, source },
    { db, user, userRegions },
  ): Promise<MutationResult<File>> => {
    // The GUID is client-supplied — the token proves this user created this
    // video via createBunnyVideo, so made-up or foreign GUIDs can't be attached.
    if (!getVideoProvider().verifyUpload(videoId, user.authUserFk, token)) {
      error(403, 'Unknown video')
    }

    const regionFk = await regionOf(db, user, entityType, entityId)
    if (regionFk == null) {
      error(404, `${entityType} not found`)
    }
    // The files UPDATE below passes for own ascents or EDIT — pre-check the
    // non-ascent case so it fails with a real message instead of an opaque
    // rollback after two inserts.
    if (entityType !== 'ascent' && !checkRegionPermission(userRegions, [REGION_PERMISSION_EDIT], regionFk)) {
      error(403, `Attaching videos to a ${entityType} requires edit permission`)
    }

    // files.bunnyStreamFk and bunnyStreams.fileFk are circular, and the
    // bunny_streams UPDATE policy can never pass a NULL -> value file_fk
    // transition (its USING clause requires file_fk to already point at an
    // own-ascent file). So: insert the file first (path '' — the convention
    // for video rows; the media lives at Bunny), insert the stream row with
    // file_fk already set, then complete the link on files — whose
    // own-ascent/EDIT update policies do pass.
    const [file] = await db
      .insert(files)
      .values({ path: '', regionFk, ...entityFks(entityType, entityId) })
      .returning()
    await db.insert(bunnyStreams).values({ id: videoId, regionFk, fileFk: file.id, source })
    const [linked] = await db.update(files).set({ bunnyStreamFk: videoId }).where(eq(files.id, file.id)).returning()
    if (linked == null) {
      // Safety net — the checks above should make this unreachable; if RLS
      // still swallows the update, roll the whole attach back rather than
      // leave a file without its video.
      error(403, 'Not allowed to attach videos here')
    }
    return { data: linked }
  },
)
