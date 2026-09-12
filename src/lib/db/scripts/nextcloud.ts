/**
 * WebDAV access for the storage migrations. The app's image access goes through the ImageProvider,
 * but that module reads `$env/static/private` (SvelteKit-only), so these scripts talk WebDAV directly.
 */
import { createClient, type WebDAVClient } from 'webdav'

export interface NextcloudDav {
  dav: WebDAVClient
  /** A stored path (`/topos/138.jpg`) prefixed with the user folder the client is rooted above. */
  userPath: (path: string) => string
}

/** Throws when the credentials are missing, so a migration stops before it reports success. */
export const connectNextcloud = (): NextcloudDav => {
  const { NEXTCLOUD_URL, NEXTCLOUD_USER_NAME, NEXTCLOUD_USER_PASSWORD } = process.env
  if (NEXTCLOUD_URL == null || NEXTCLOUD_USER_NAME == null || NEXTCLOUD_USER_PASSWORD == null) {
    throw new Error('NEXTCLOUD_URL / NEXTCLOUD_USER_NAME / NEXTCLOUD_USER_PASSWORD must be set')
  }

  const dav = createClient(`${NEXTCLOUD_URL}/remote.php/dav/files`, {
    password: NEXTCLOUD_USER_PASSWORD,
    username: NEXTCLOUD_USER_NAME,
  })

  return { dav, userPath: (path) => `${NEXTCLOUD_USER_NAME}${path}` }
}
