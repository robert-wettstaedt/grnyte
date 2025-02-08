import { NEXTCLOUD_URL, NEXTCLOUD_USER_NAME, NEXTCLOUD_USER_PASSWORD } from '$env/static/private'
import * as schema from '$lib/db/schema'
import { convertException } from '$lib/errors'
import { error } from '@sveltejs/kit'
import { createClient, type FileStat, type ResponseDataDetailed, type WebDAVClient } from 'webdav'
import type { FileDTO } from '.'

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

/**
 * Searches for a file in Nextcloud using the provided session and file information.
 *
 * @param {schema.File} file - The file object containing the path to search for.
 * @returns {Promise<FileStat>} - A promise that resolves to the file statistics if found.
 * @throws {Error} - Throws an error if the session is invalid, the file is not found, or there is an issue with the search request.
 */
export const searchNextcloudFile = async (file: schema.File): Promise<FileStat> => {
  try {
    const path = file.path.startsWith('/') ? file.path : `/${file.path}`
    const stat = (await getNextcloud().stat(NEXTCLOUD_USER_NAME + path, {
      details: true,
      data: `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns" xmlns:nc="http://nextcloud.org/ns">
  <d:prop>
    <d:getlastmodified />
    <d:getetag />
    <d:getcontenttype />
    <d:resourcetype />
    <oc:fileid />
    <oc:permissions />
    <oc:size />
    <d:getcontentlength />
    <nc:has-preview />
    <oc:favorite />
    <oc:comments-unread />
    <oc:owner-display-name />
    <oc:share-types />
    <nc:contained-folder-count />
    <nc:contained-file-count />
  </d:prop>
</d:propfind>`,
    })) as ResponseDataDetailed<FileStat>

    return { ...stat.data, filename: stat.data.filename.replace(`/${NEXTCLOUD_USER_NAME}`, '') }
  } catch (exception) {
    const { response, status } = exception as { response: Response | undefined; status: number | undefined }

    if (response != null && typeof status === 'number') {
      const msg = await response.text()
      error(status, msg)
    }

    error(400, `File with id "${file.id}" not found`)
  }
}

export const deleteFile = async (file: schema.File) => {
  const nextcloud = getNextcloud()

  const [filename, ...pathSegments] = file.path.split('/').reverse()
  const path = pathSegments.reverse().join('/')
  const basename = filename.split('.').slice(0, -1).join('.')

  const contents = await nextcloud.getDirectoryContents(NEXTCLOUD_USER_NAME + path, { glob: `${basename}.*` })

  if (Array.isArray(contents)) {
    await Promise.all(contents.map((content) => nextcloud.deleteFile(content.filename)))
  }
}
