import { NEXTCLOUD_URL, NEXTCLOUD_USER_NAME, NEXTCLOUD_USER_PASSWORD } from '$env/static/private'
import { createClient, type ResponseDataDetailed, type WebDAVClient } from 'webdav'
import { derivativePath, pickDerivativeSize } from './derivatives'
import type { ImagePayload, ImageProvider, OriginalOptions, ThumbnailOptions } from './provider.server'

const basicAuth = `Basic ${Buffer.from(`${NEXTCLOUD_USER_NAME}:${NEXTCLOUD_USER_PASSWORD}`).toString('base64')}`

/** HTTP status of a webdav client error; undefined for non-HTTP failures. */
const statusOf = (error: unknown): number | undefined => (error as null | { status?: number })?.status

// The WebDAV client is a private detail of this provider. The image provider is
// the app's only Nextcloud boundary — originals, thumbnails, and future
// uploads/deletes all go through here — so nothing else talks to it directly.
let client: undefined | WebDAVClient
const dav = (): WebDAVClient =>
  (client ??= createClient(`${NEXTCLOUD_URL}/remote.php/dav/files`, {
    password: NEXTCLOUD_USER_PASSWORD,
    username: NEXTCLOUD_USER_NAME,
  }))

let instance: ImageProvider | undefined

/** The Nextcloud-backed {@link ImageProvider}, created once and reused. */
export const getNextcloudImageProvider = (): ImageProvider => (instance ??= create())

function create(): ImageProvider {
  return {
    async fetchOriginal(path: string, options: OriginalOptions = {}): Promise<ImagePayload> {
      const res = (await dav().getFileContents(`${NEXTCLOUD_USER_NAME}${path}`, {
        details: true,
        headers: options.requestHeaders,
        signal: options.signal,
      })) as ResponseDataDetailed<ArrayBuffer>

      return {
        data: res.data,
        headers: new Headers(res.headers),
        status: res.status,
        statusText: res.statusText,
      }
    },

    async fetchThumbnail(path: string, options: ThumbnailOptions): Promise<ImagePayload> {
      // Two tiers: a pre-generated webp derivative sibling first (quality-first —
      // visibly better than Nextcloud's jpeg previews at the same bytes, #472),
      // then the Nextcloud preview for files without one (older uploads, failed
      // generation, non-images).
      try {
        const res = (await dav().getFileContents(
          `${NEXTCLOUD_USER_NAME}${derivativePath(path, pickDerivativeSize(options.width))}`,
          { details: true, signal: options.signal },
        )) as ResponseDataDetailed<ArrayBuffer>

        // Explicit Content-Type so the contract doesn't depend on the storage
        // backend's MIME configuration for `.webp`.
        const headers = new Headers(res.headers)
        headers.set('Content-Type', 'image/webp')

        return {
          data: res.data,
          headers,
          status: res.status,
          statusText: res.statusText,
        }
      } catch {
        // Derivative missing — fall through to the preview.
      }

      // Nextcloud generates and disk-caches previews itself, so we hand the resize
      // off entirely — no fetching the full-res original just to shrink it here.
      // `a=1` preserves the aspect ratio, so the topo line drawn against the
      // original's proportions still aligns once the tile crops it client-side.
      const preview = new URL('/index.php/core/preview.png', NEXTCLOUD_URL)
      preview.searchParams.set('file', path)
      preview.searchParams.set('x', String(options.width))
      preview.searchParams.set('y', String(options.width))
      preview.searchParams.set('a', '1')

      const res = await fetch(preview, { headers: { Authorization: basicAuth }, signal: options.signal })
      if (!res.ok) {
        throw new Error(`Nextcloud preview ${res.status} for "${path}"`)
      }

      return {
        data: await res.arrayBuffer(),
        headers: res.headers,
        status: res.status,
        statusText: res.statusText,
      }
    },

    async remove(path: string): Promise<void> {
      await dav().deleteFile(`${NEXTCLOUD_USER_NAME}${path}`)
    },

    async store(path: string, data: Buffer): Promise<void> {
      const target = `${NEXTCLOUD_USER_NAME}${path}`
      try {
        await dav().putFileContents(target, data)
      } catch (putError) {
        // A missing parent folder (404/409) is the one recoverable failure —
        // create it and retry once. Everything else (auth, quota, 5xx) surfaces as-is.
        if (statusOf(putError) !== 404 && statusOf(putError) !== 409) {
          throw putError
        }
        try {
          await dav().createDirectory(target.slice(0, target.lastIndexOf('/')), { recursive: true })
        } catch (mkcolError) {
          // 405 = a concurrent store() won the race to create it — just as good.
          if (statusOf(mkcolError) !== 405) {
            throw mkcolError
          }
        }
        await dav().putFileContents(target, data)
      }
    },
  }
}
