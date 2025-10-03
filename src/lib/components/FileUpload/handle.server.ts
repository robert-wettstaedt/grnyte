import { NEXTCLOUD_USER_NAME } from '$env/static/private'
import * as schema from '$lib/db/schema'
import { convertException } from '$lib/errors'
import { getNextcloud, mkDir } from '$lib/nextcloud/nextcloud.server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { eq } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import convert from 'heic-convert'
import sharp from 'sharp'

interface FileUploadResult {
  file: schema.File
  fileBuffer?: ArrayBuffer
}

export const handleFileUpload = async (
  db: PostgresJsDatabase<typeof schema>,
  supabase: SupabaseClient,
  srcFolder: string | undefined,
  dstFolder: string,
  fileInit: Partial<schema.InsertFile> & Required<Pick<schema.InsertFile, 'regionFk'>>,
  bunnyVideoIds?: string | string[] | null,
): Promise<FileUploadResult[]> => {
  const files: FileUploadResult[] = []

  if (bunnyVideoIds != null) {
    files.push(...(await handleBunnyVideoUpload(db, bunnyVideoIds, fileInit)))
  } else if (srcFolder != null) {
    files.push(...(await handleSupabaseFileUpload(db, supabase, srcFolder, dstFolder, fileInit)))
  }

  return files
}

export const handleSupabaseFileUpload = async (
  db: PostgresJsDatabase<typeof schema>,
  supabase: SupabaseClient,
  srcFolder: string,
  dstFolder: string,
  fileInit: Partial<schema.InsertFile> & Required<Pick<schema.InsertFile, 'regionFk'>>,
): Promise<FileUploadResult[]> => {
  const nextcloud = getNextcloud()

  const listResult = await supabase.storage.from('uploads').list(srcFolder)
  if (listResult.error != null) {
    throw listResult.error
  }

  await mkDir(dstFolder)

  const createdFiles = await Promise.all(
    listResult.data.map(async (supabaseFile) => {
      const [dbFile] = await db
        .insert(schema.files)
        .values({ ...fileInit, path: `${dstFolder}/${supabaseFile.name}` })
        .returning()

      const ext =
        typeof supabaseFile.metadata.mimetype === 'string' && supabaseFile.metadata.mimetype.startsWith('image/')
          ? 'jpg'
          : supabaseFile.name.split('.').at(-1)

      const fileName = `${dbFile.id}.${ext}`
      const origFileName = `${dbFile.id}.orig.${ext}`
      const path = `${dstFolder}/${fileName}`
      const origPath = `${dstFolder}/${origFileName}`

      await db.update(schema.files).set({ path }).where(eq(schema.files.id, dbFile.id))

      return { ...dbFile, path, origPath }
    }),
  )

  try {
    return await Promise.all(
      listResult.data.map(async (supabaseFile, index) => {
        const createdFile = createdFiles[index]

        const downloadResult = await supabase.storage.from('uploads').download(`${srcFolder}/${supabaseFile.name}`)
        if (downloadResult.error != null) {
          throw downloadResult.error
        }

        let fileBuffer = await downloadResult.data.arrayBuffer()

        if (supabaseFile.metadata.mimetype === 'image/heic') {
          // https://github.com/catdad-experiments/heic-convert/issues/34
          const buffer = new Uint8Array(fileBuffer) as unknown as ArrayBufferLike
          fileBuffer = await convert({ buffer, format: 'JPEG', quality: 1 })
        }

        if (typeof supabaseFile.metadata.mimetype === 'string' && supabaseFile.metadata.mimetype.startsWith('image/')) {
          const image = sharp(fileBuffer)
          const metadata = await image.metadata()

          const resizeOpts: sharp.ResizeOptions =
            (metadata.width ?? 0) > (metadata.height ?? 0) ? { height: 1024 } : { width: 1024 }
          const resizedBuffer = await image.resize(resizeOpts).keepMetadata().jpeg().toBuffer()

          await Promise.all([
            nextcloud.putFileContents(NEXTCLOUD_USER_NAME + createdFile.origPath, fileBuffer),
            nextcloud.putFileContents(NEXTCLOUD_USER_NAME + createdFile.path, resizedBuffer),
          ])
        } else {
          await nextcloud.putFileContents(NEXTCLOUD_USER_NAME + createdFile.path, fileBuffer)
        }

        return { fileBuffer, file: createdFile }
      }),
    )
  } catch (exception) {
    await Promise.all(
      createdFiles.map(async (file) => {
        try {
          await db.delete(schema.files).where(eq(schema.files.id, file.id))

          if (await nextcloud.exists(NEXTCLOUD_USER_NAME + file.path)) {
            await nextcloud.deleteFile(NEXTCLOUD_USER_NAME + file.path)
          }

          if (await nextcloud.exists(NEXTCLOUD_USER_NAME + file.origPath)) {
            await nextcloud.deleteFile(NEXTCLOUD_USER_NAME + file.origPath)
          }
        } catch (exception) {
          console.error(convertException(exception))
        }
      }),
    )

    throw exception
  } finally {
    await supabase.storage.from('uploads').remove(listResult.data.map((file) => `${srcFolder}/${file.name}`))
  }
}

export const handleBunnyVideoUpload = async (
  db: PostgresJsDatabase<typeof schema>,
  bunnyVideoId: string | string[],
  fileInit: Partial<schema.InsertFile> & Required<Pick<schema.InsertFile, 'regionFk'>>,
): Promise<FileUploadResult[]> => {
  const bunnyVideoIds = Array.isArray(bunnyVideoId) ? bunnyVideoId : [bunnyVideoId]

  return Promise.all(
    bunnyVideoIds.map(async (bunnyVideoId) => {
      const [dbFile] = await db
        .insert(schema.files)
        .values({ ...fileInit, path: '' })
        .returning()

      await db.insert(schema.bunnyStreams).values({ id: bunnyVideoId, fileFk: dbFile.id, regionFk: dbFile.regionFk })
      await db.update(schema.files).set({ bunnyStreamFk: bunnyVideoId }).where(eq(schema.files.id, dbFile.id))

      return { file: dbFile }
    }),
  )
}
