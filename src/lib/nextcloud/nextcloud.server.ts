import { NEXTCLOUD_URL, NEXTCLOUD_USER_NAME, NEXTCLOUD_USER_PASSWORD } from '$env/static/private'
import { READ_PERMISSION } from '$lib/auth'
import * as schema from '$lib/db/schema'
import { convertException } from '$lib/errors'
import { error, type RequestEvent } from '@sveltejs/kit'
import { createClient, type FileStat, type Headers, type ResponseDataDetailed, type WebDAVClient } from 'webdav'
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
    if (file.path.length === 0) {
      return {
        basename: '',
        filename: '',
        lastmod: '',
        size: 0,
        type: 'file',
        etag: '',
      }
    }

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

/**
 * Loads file information from Nextcloud for a given list of files.
 *
 * @param {schema.File[]} files - The list of files to load information for.
 * @returns {Promise<FileDTO[]>} A promise that resolves to an array of FileDTO objects containing file information.
 */
export const loadFiles = (files: schema.File[]): Promise<FileDTO[]> => {
  return Promise.all(
    files.map(async (file) => {
      try {
        const stat = await searchNextcloudFile(file)
        return { ...file, error: undefined, stat }
      } catch (exception) {
        return { ...file, error: convertException(exception), stat: undefined }
      }
    }),
  )
}

export const mkDir = async (path: string): Promise<string> => {
  const nextcloud = getNextcloud()

  const segments = path.split('/')

  for (let i = 1; i <= segments.length; i++) {
    const segment = segments.slice(0, i).join('/')

    if (!(await nextcloud.exists(NEXTCLOUD_USER_NAME + segment))) {
      await nextcloud.createDirectory(NEXTCLOUD_USER_NAME + segment)
      await new Promise((r) => setTimeout(r, 100))
    }
  }

  return path
}

export const deleteFile = async (file: schema.File) => {
  const nextcloud = getNextcloud()

  if (file.path.length === 0) {
    return
  }

  const [filename, ...pathSegments] = file.path.split('/').reverse()
  const path = pathSegments.reverse().join('/')
  const basename = filename.split('.').slice(0, -1).join('.')

  const contents = await nextcloud.getDirectoryContents(NEXTCLOUD_USER_NAME + path, { glob: `${basename}.*` })

  if (Array.isArray(contents)) {
    await Promise.all(contents.map((content) => nextcloud.deleteFile(content.filename)))
  }
}

export const imagePreviewHandler = async (path: string, event: RequestEvent) => {
  const { locals, request, url } = event

  if (!locals.userPermissions?.includes(READ_PERMISSION)) {
    return new Response(null, { status: 404 })
  }

  // Extract relevant headers from the request
  const reqHeaders = Array.from(request.headers.entries()).reduce(
    (headers, [key, value]) => {
      // Include only 'accept' and 'range' headers
      if (['accept', 'range'].includes(key.toLowerCase())) {
        return { ...headers, [key]: value }
      }
      return headers
    },
    { Authorization: `Basic ${btoa(`${NEXTCLOUD_USER_NAME}:${NEXTCLOUD_USER_PASSWORD}`)}` } as Headers,
  )

  const file = await searchNextcloudFile({
    areaFk: null,
    ascentFk: null,
    blockFk: null,
    bunnyStreamFk: null,
    id: '0',
    path,
    routeFk: null,
    visibility: null,
  })

  const searchParams = new URLSearchParams(url.searchParams)
  searchParams.set('fileId', String(file.props?.fileid ?? ''))

  const result = await fetch(`${NEXTCLOUD_URL}/core/preview?${searchParams}`, {
    headers: reqHeaders,
    signal: request.signal,
  })

  const resHeaders = new Headers(result.headers)
  // eslint-disable-next-line drizzle/enforce-delete-with-where
  resHeaders.delete('Set-Cookie')
  // eslint-disable-next-line drizzle/enforce-delete-with-where
  resHeaders.delete('Content-Encoding')

  return new Response(result.body, {
    headers: resHeaders,
    status: result.status,
    statusText: result.statusText,
  })
}
