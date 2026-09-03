import { getNextcloudImageProvider } from './nextcloud.provider.server'

/** A relayed upstream image response: the `/image` route copies these onto its own `Response`. */
export interface ImagePayload {
  data: ArrayBuffer
  headers: Headers
  status: number
  statusText: string
}

/**
 * The app's single image-storage boundary, decoupled from the HTTP route that
 * serves it. The active implementation fully encapsulates its backend client
 * (nothing else in the app talks to Nextcloud), so swapping providers
 * (Nextcloud → S3 / a CDN / …) is one new implementation plus a change to
 * {@link getImageProvider}: no consumer, and no route handler, touches the
 * backend directly.
 *
 * ponytail: single implementation today, but the seam is the explicit ask.
 * Future write ops (upload / delete) belong on this interface too. Keep every
 * backend call behind it; don't reach past it into the client.
 */
export interface ImageProvider {
  /** The full-resolution original. `requestHeaders` enables range / partial responses. */
  fetchOriginal(path: string, options?: OriginalOptions): Promise<ImagePayload>
  /** A small, cacheable, aspect-preserving thumbnail at (about) `width` px. Throws if unavailable. */
  fetchThumbnail(path: string, options: ThumbnailOptions): Promise<ImagePayload>
  /** Delete the object at `path`. */
  remove(path: string): Promise<void>
  /** Write `data` at `path`, creating missing parent folders. Overwrites silently. */
  store(path: string, data: Buffer): Promise<void>
}

export interface OriginalOptions {
  /** Client headers to forward upstream for range / content negotiation (e.g. `range`, `accept`). */
  requestHeaders?: Record<string, string>
  signal?: AbortSignal
}

export interface ThumbnailOptions {
  signal?: AbortSignal
  /** Target box in px; the aspect ratio is preserved (the caller crops the tile). */
  width: number
}

/** The image provider the app is configured to use. Swap the backend here. */
export const getImageProvider = (): ImageProvider => getNextcloudImageProvider()
