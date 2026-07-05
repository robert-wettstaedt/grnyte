/**
 * Image upload staging — pure module shared by the browser (upload + validation)
 * and `finalizeImage` (the server side of the flow). Images are staged in a
 * private Supabase bucket because the app runs behind Vercel's 4.5MB body limit
 * and must not proxy file bytes; the server then moves them to image storage.
 */
import { createId as createCuid2 } from '@paralleldrive/cuid2'

/** The private Supabase bucket uploads are staged in (created in migration 0075). */
export const STAGING_BUCKET = 'staging'

/** Per-image size cap enforced client-side before staging. */
export const MAX_IMAGE_SIZE = 50 * 1024 * 1024

/** Per-video size cap enforced client-side before the TUS upload starts. Bunny
 *  itself has no size limit — this is purely the accident/abuse knob, sized so
 *  the heaviest sane beta clip (2min 4K120 H.264 ≈ 1.6GB) still fits. */
export const MAX_VIDEO_SIZE = 2 * 1024 ** 3

/** Entities an image can be attached to — mirrors the FK columns on `files`. */
export const fileEntityTypes = ['area', 'ascent', 'block', 'route'] as const
export type FileEntityType = (typeof fileEntityTypes)[number]

/** Media kinds a drop zone can accept. One field routes each file to its
 *  pipeline internally (images → staging, videos → Bunny) — the split is
 *  transport, not UI. */
export type MediaKind = 'image' | 'video'

/** Raster formats `finalizeImage` accepts (drives the picker's `accept` too). */
export const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'] as const

/** Lowercased file extension without the dot; `null` when there is none. */
export const extensionOf = (name: string): string | null => /\.([^./]+)$/.exec(name)?.[1].toLowerCase() ?? null

export const isImageFileName = (name: string): boolean =>
  (IMAGE_EXTENSIONS as readonly string[]).includes(extensionOf(name) ?? '')

/** Container formats routed to the video pipeline. Bunny transcodes almost
 *  anything, so the list only backstops files whose MIME type the browser
 *  reports as empty (mirrors the HEIC rescue for images). */
export const VIDEO_EXTENSIONS = ['mp4', 'mov', 'm4v', 'webm'] as const

export const isVideoFile = (file: File): boolean =>
  file.type.startsWith('video/') || (VIDEO_EXTENSIONS as readonly string[]).includes(extensionOf(file.name) ?? '')

/** The staging bucket only admits image/* content types, but browsers often
 *  report an empty `File.type` for HEIC — this is the by-extension fallback. */
const IMAGE_MIME_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
}
export const imageMimeOf = (name: string): string | undefined => IMAGE_MIME_TYPES[extensionOf(name) ?? '']

export const isHeic = (name: string): boolean => ['heic', 'heif'].includes(extensionOf(name) ?? '')

/**
 * Where the browser uploads to in the staging bucket: `<auth-uid>/<cuid>.<ext>`.
 * The uid prefix is what the bucket's RLS policies scope to; the cuid avoids
 * collisions without coordination.
 */
export const stagingPath = (authUserId: string, fileName: string): string => {
  const extension = extensionOf(fileName)
  return `${authUserId}/${createCuid2()}${extension == null ? '' : `.${extension}`}`
}
