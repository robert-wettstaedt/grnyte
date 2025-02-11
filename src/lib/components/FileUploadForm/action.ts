import { PUBLIC_SUPABASE_URL } from '$env/static/public'
import { config } from '$lib/config'
import * as tus from 'tus-js-client'
import { compress, getMetadata, getThumbnail, transcode } from './video'

interface PageData {
  session: App.PageData['session']
  user: App.PageData['user']
  supabase: App.Locals['supabase']
}

export interface Progress {
  percentage: number
  step: string
}

export const uploadData = async (
  formData: FormData,
  pageData: PageData,
  signal: AbortSignal | undefined | null,
  onProgress?: (progress: Progress) => void,
) => {
  onProgress?.({ percentage: 0, step: 'initializing' })

  const files = formData
    .getAll('files')
    .filter((file) => file instanceof File)
    .filter((file) => file.size > 0)

  // eslint-disable-next-line drizzle/enforce-delete-with-where
  formData.delete('files')

  if (pageData.session == null || pageData.user == null || files.length === 0) {
    return
  }

  const preprocessed = await preprocessFiles(files)

  const toCompress = preprocessed.filter((data) => data.shouldCompress || data.shouldTranscode).length
  const compressed = preprocessed.map(() => 0)

  const processed = await processFiles(preprocessed, signal, (progress, index) => {
    compressed[index] = progress
    const totalCompressed = compressed.reduce((acc, bytes) => acc + bytes, 0)
    const percentage = totalCompressed / toCompress

    onProgress?.({ percentage: percentage * 100, step: 'compressing' })
  })

  if (processed.some(({ file }) => file.size > config.files.maxSize.number)) {
    throw new Error(`File size exceeds the maximum allowed size (${config.files.maxSize.human})`)
  }

  const totalBytes = processed.reduce((acc, { file }) => acc + file.size, 0)
  const uploaded = processed.map(() => 0)

  await uploadFiles(processed, pageData, formData, (bytesUploaded, index) => {
    uploaded[index] = bytesUploaded
    const totalUploaded = uploaded.reduce((acc, bytes) => acc + bytes, 0)
    const percentage = totalUploaded / totalBytes

    onProgress?.({ percentage: percentage * 100, step: 'uploading' })
  })

  onProgress?.({ percentage: 100, step: 'done' })
}

interface ProcessedFile {
  filename: string
  file: File
  shouldCompress: boolean
  shouldTranscode: boolean
}

const preprocessFiles = async (files: File[]) => {
  return await Promise.all(
    files.map(async (file): Promise<ProcessedFile> => {
      const basename = crypto.randomUUID()
      const filename = basename + '.' + file.name.split('.').pop()
      let shouldCompress = false
      let shouldTranscode = false

      if (file.type.startsWith('video/')) {
        const metadata = await getMetadata(file)

        shouldCompress =
          metadata.filesize > config.files.maxSize.number ||
          metadata.height > 1200 ||
          metadata.width > 1200 ||
          metadata.bitrate > 5_000_000

        shouldTranscode = metadata.codec !== 'h264'
      }

      return { filename, file, shouldCompress, shouldTranscode }
    }),
  )
}

const processFiles = async (
  files: ProcessedFile[],
  signal: AbortSignal | undefined | null,
  onProgress?: (progress: number, index: number) => void,
) => {
  const preprocessed = await Promise.all(
    files.map(async (data, index): Promise<ProcessedFile[]> => {
      if (data.file.type.startsWith('video/')) {
        const basename = data.filename.split('.').slice(0, -1).join('.')
        const filename = data.shouldCompress || data.shouldTranscode ? basename + '.mp4' : data.filename

        const thumbnail = await getThumbnail(data.file)
        const thumbnailFilename = `${filename}.thumbnail.jpg`
        const thumbnailFile = new File([thumbnail], thumbnailFilename, { type: 'image/jpeg' })
        const processedThumbnail: ProcessedFile = {
          filename: thumbnailFilename,
          file: thumbnailFile,
          shouldCompress: false,
          shouldTranscode: false,
        }

        if (data.shouldCompress) {
          const compressed = await compress(data.file, signal, (progress) => onProgress?.(progress, index))

          const compressedFile = new File([compressed], filename, { type: 'video/mp4' })
          return [{ ...data, filename, file: compressedFile }, processedThumbnail]
        }

        if (data.shouldTranscode) {
          const transcoded = await transcode(data.file, signal, (progress) => onProgress?.(progress, index))

          const transcodedFile = new File([transcoded], filename, { type: 'video/mp4' })
          return [{ ...data, filename, file: transcodedFile }, processedThumbnail]
        }

        return [data, processedThumbnail]
      }

      return [data]
    }),
  )

  return preprocessed.flat()
}

const uploadFiles = async (
  files: ProcessedFile[],
  pageData: PageData,
  formData: FormData,
  onProgress?: (bytesUploaded: number, index: number) => void,
) => {
  const folderName = formData.get('folderName')

  await Promise.all(
    files.map(async (data, index) => {
      const filepath = [folderName, data.filename].filter(Boolean).join('/')
      formData.append('filenames', filepath)

      try {
        await uploadTus(data.file, pageData.session!.access_token, filepath, (bytesUploaded) =>
          onProgress?.(bytesUploaded, index),
        )
      } catch (exception) {
        const { error } = await pageData.supabase!.storage.from(config.files.buckets.files).upload(filepath, data.file)

        if (error != null) {
          throw error
        }
      }
    }),
  )
}

const uploadTus = async (file: File, token: string, fileName: string, onProgress?: (bytesUploaded: number) => void) => {
  await new Promise((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: `${PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${token}`,
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true, // Important if you want to allow re-uploading the same file https://github.com/tus/tus-js-client/blob/main/docs/api.md#removefingerprintonsuccess
      metadata: {
        bucketName: config.files.buckets.files,
        objectName: fileName,
        contentType: file.type,
        cacheControl: '3600',
      },
      chunkSize: 6 * 1024 * 1024, // NOTE: it must be set to 6MB (for now) do not change it
      onError: function (error) {
        reject(error)
      },
      onProgress: function (bytesUploaded) {
        onProgress?.(bytesUploaded)
      },
      onSuccess: function () {
        resolve(null)
      },
    })

    // Check if there are any previous uploads to continue.
    return upload.findPreviousUploads().then(function (previousUploads) {
      // Found previous uploads so we select the first one.
      if (previousUploads.length) {
        upload.resumeFromPreviousUpload(previousUploads[0])
      }

      // Start the upload
      upload.start()
    })
  })
}
