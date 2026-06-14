import { NEXTCLOUD_URL, NEXTCLOUD_USER_NAME, NEXTCLOUD_USER_PASSWORD } from '$env/static/private'
import { createClient, type WebDAVClient } from 'webdav'

/**
 * Creates a WebDAV client for Nextcloud using the provided session and path.
 *
 * @param {string} [path='/remote.php/dav/files'] - The path to the WebDAV endpoint.
 * @returns {WebDAVClient} - The WebDAV client configured for Nextcloud.
 * @throws {Error} - Throws an error if the session is invalid or missing required information.
 */
export const getNextcloud = (path = '/remote.php/dav/files'): WebDAVClient => {
  return createClient(NEXTCLOUD_URL + path, {
    username: NEXTCLOUD_USER_NAME,
    password: NEXTCLOUD_USER_PASSWORD,
  })
}
