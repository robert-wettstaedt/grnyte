import { config } from '$lib/config'
import type { NestedEntityToStorageObject } from '$lib/db/types'
import { convertException } from '$lib/errors'
import type { TransformOptions } from '@supabase/storage-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

export const metadataSchema = z.object({
  cacheControl: z.string(),
  contentLength: z.number(),
  eTag: z.string(),
  httpStatusCode: z.number(),
  lastModified: z.string(),
  mimetype: z.string(),
  size: z.number(),
  url: z.string().optional(),
})

export interface ObjectDTO extends NestedEntityToStorageObject {
  error?: string
  stat?: z.infer<typeof metadataSchema>
  thumbnail?: { url: string }
}

export const loadObject = async (
  supabase: SupabaseClient,
  object: NestedEntityToStorageObject,
  transform: TransformOptions = { width: 800 },
): Promise<ObjectDTO> => {
  if (object.storageObject.name == null) {
    return { ...object, error: 'Storage object name is null' }
  }

  try {
    const metadata = await metadataSchema.parseAsync(object.storageObject.metadata)

    const result = await supabase.storage
      .from(config.files.buckets.files)
      .createSignedUrl(object.storageObject.name, 3600, {
        transform: metadata.mimetype.startsWith('image/') ? transform : undefined,
      })

    let thumbnail: ObjectDTO['thumbnail'] = undefined

    if (metadata.mimetype.startsWith('video/')) {
      const thumbnailFilename = `${object.storageObject.name}.thumbnail.jpg`
      const thumbnailResult = await supabase.storage
        .from(config.files.buckets.files)
        .createSignedUrl(thumbnailFilename, 3600, { transform: { width: 400 } })

      if (thumbnailResult.error == null) {
        thumbnail = { url: thumbnailResult.data.signedUrl }
      }
    }

    if (result.error != null) {
      return { ...object, error: result.error.message }
    }

    return { ...object, stat: { ...metadata, url: result.data.signedUrl }, thumbnail }
  } catch (exception) {
    return { ...object, error: convertException(exception) }
  }
}

export const loadObjects = async (
  supabase: SupabaseClient,
  objects: NestedEntityToStorageObject[],
  transform?: TransformOptions,
): Promise<ObjectDTO[]> => {
  return Promise.all(objects.map((item) => loadObject(supabase, item, transform)))
}

export const deleteObject = async (
  file: NestedEntityToStorageObject | NestedEntityToStorageObject[],
  supabase: SupabaseClient,
) => {
  const files = Array.isArray(file) ? file : [file]

  const fileNamesResults = await Promise.all(
    files.map(async (file) => {
      if (file.storageObject.name == null) {
        return []
      }

      const thumbnailFilename = `${file.storageObject.name}.thumbnail.jpg`
      const fileNames: string[] = []

      const fileExists = await supabase.storage.from(config.files.buckets.files).exists(file.storageObject.name)
      if (fileExists.data) {
        fileNames.push(file.storageObject.name)
      }

      const thumbnailExists = await supabase.storage.from(config.files.buckets.files).exists(thumbnailFilename)
      if (thumbnailExists.data) {
        fileNames.push(thumbnailFilename)
      }

      return fileNames
    }),
  )

  const fileNames = fileNamesResults.flat()

  if (fileNames.length > 0) {
    await supabase.storage.from(config.files.buckets.files).remove(fileNames)
  }
}
