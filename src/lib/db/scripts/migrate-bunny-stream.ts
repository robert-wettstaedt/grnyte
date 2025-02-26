import { createCollection, createVideo, getCollections, uploadVideo } from '$lib/bunny'
import dotenv from 'dotenv'
import { eq, ilike, or } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { Readable } from 'stream'
import { createClient, type BufferLike, type FileStat, type ResponseDataDetailed, type WebDAVClient } from 'webdav'
import * as schema from '../schema'
import cliProgress from 'cli-progress'

dotenv.config()
const { NEXTCLOUD_URL, NEXTCLOUD_USER_NAME, NEXTCLOUD_USER_PASSWORD, BUNNY_API_KEY, BUNNY_LIBRARY_ID } = process.env

export const migrate = async (db: PostgresJsDatabase<typeof schema>) => {
  if (BUNNY_API_KEY == null || BUNNY_LIBRARY_ID == null) {
    throw new Error('BUNNY_API_KEY and BUNNY_LIBRARY_ID must be set')
  }

  const nextcloud = createClient(NEXTCLOUD_URL + '/remote.php/dav/files', {
    username: NEXTCLOUD_USER_NAME,
    password: NEXTCLOUD_USER_PASSWORD,
  })

  const files = await db.query.files.findMany({
    orderBy: (files, { asc }) => [asc(files.id)],
    where: or(ilike(schema.files.path, '%.mp4%'), ilike(schema.files.path, '%.mov%')),
    with: {
      area: { with: { author: true } },
      ascent: { with: { author: true } },
      block: { with: { author: true } },
      route: { with: { author: true } },
    },
  })

  const collections = await getCollections({
    apiKey: BUNNY_API_KEY,
    libraryId: BUNNY_LIBRARY_ID,
  })

  for await (const file of files.slice(0, 1)) {
    console.log('Migrating:', file.path)

    const stat = await searchNextcloudFile(nextcloud, file)

    console.log('Found nextcloud file:', stat.filename)

    const downloadBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic)
    downloadBar.start(stat.size, 0)

    const content = await nextcloud?.getFileContents(`${NEXTCLOUD_USER_NAME}/${stat.filename}`, {
      details: true,
      onDownloadProgress: (event) => {
        downloadBar.update(event.loaded)
      },
    })
    const { data } = content as ResponseDataDetailed<BufferLike>
    downloadBar.stop()

    const authorFk =
      file.area?.author.authUserFk ??
      file.ascent?.author.authUserFk ??
      file.block?.author.authUserFk ??
      file.route?.author.authUserFk

    if (authorFk == null) {
      throw new Error('Author FK is null')
    }

    const ext = file.path.split('.').pop()

    // Convert BufferLike to Buffer for Node.js environment
    const fileBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer)
    // Create a Readable stream from the buffer
    const fileStream = Readable.from(fileBuffer)

    let collection = collections.items?.find((c) => c.name === authorFk)

    if (collection == null) {
      collection = await createCollection({
        apiKey: BUNNY_API_KEY,
        libraryId: BUNNY_LIBRARY_ID,
        name: authorFk,
      })

      collections.items?.push(collection)
    }

    const title = String(file.id).padStart(6, '0')

    const video = await createVideo({
      apiKey: BUNNY_API_KEY,
      collectionId: collection.guid,
      libraryId: BUNNY_LIBRARY_ID,
      title,
    })

    console.log('Video created:', video.guid)

    if (video.guid == null) {
      throw new Error('Video guid is null')
    }

    await db.insert(schema.bunnyStreams).values({ fileFk: file.id, id: video.guid })
    await db.update(schema.files).set({ bunnyStreamFk: video.guid }).where(eq(schema.files.id, file.id))

    const uploadBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic)
    uploadBar.start(fileBuffer.length, 0)

    await uploadVideo({
      apiKey: BUNNY_API_KEY,
      collectionId: collection.guid,
      file: fileStream,
      fileSize: fileBuffer.length,
      fileName: title,
      fileType: `video/${ext}`,
      libraryId: BUNNY_LIBRARY_ID,
      videoId: video.guid,
      onProgress: (bytesUploaded) => {
        uploadBar.update(bytesUploaded)
      },
    })

    uploadBar.stop()
  }
}

export const searchNextcloudFile = async (nextcloud: WebDAVClient, file: schema.File): Promise<FileStat> => {
  try {
    const path = file.path.startsWith('/') ? file.path : `/${file.path}`
    const stat = (await nextcloud.stat(NEXTCLOUD_USER_NAME + path, {
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
      throw new Error(msg)
    }

    throw new Error(`File with id "${file.id}" not found`)
  }
}
