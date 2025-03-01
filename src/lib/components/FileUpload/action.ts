import { enhance } from '$app/forms'
import { PUBLIC_SUPABASE_URL } from '$env/static/public'
import { uploadVideo } from '$lib/bunny'
import { upfetch } from '$lib/config'
import type { Action } from 'svelte/action'
import * as tus from 'tus-js-client'
import { CreateVideoResponseSchema } from '../../../routes/api/files/videos/lib'

interface EnhanceFileUploadOptions extends Pick<App.PageData, 'session' | 'supabase'> {
  onError?: (error: string) => void
  onProgress?: (percentage: number) => void
  onSubmit?: Parameters<typeof enhance>[1]
}

export const enhanceWithFile: Action<HTMLFormElement, EnhanceFileUploadOptions> = (node, parameters) => {
  const { onError, onSubmit, onProgress, session, supabase } = parameters

  const enhanced = enhance(node, async (event) => {
    const result = await onSubmit?.(event)
    const returnValue: ReturnType<NonNullable<EnhanceFileUploadOptions['onSubmit']>> = async (event) => {
      return result?.(event)
    }

    const files = event.formData
      .getAll('files')
      .filter((file) => file instanceof File)
      .filter((file) => file.size > 0)

    // eslint-disable-next-line drizzle/enforce-delete-with-where
    event.formData.delete('files')

    let folderName = event.formData.get('folderName')

    if (session == null || files.length === 0) {
      return returnValue
    }

    if (typeof folderName === 'string' && folderName.length > 0) {
      return returnValue
    }

    folderName = `${session.user.id}-${Date.now()}`
    event.formData.set('folderName', folderName)

    await Promise.all(
      files.map((file) =>
        uploadFile(file, {
          accessToken: session.access_token,
          folderName,
          formData: event.formData,
          onError,
          onProgress,
          supabase,
        }),
      ),
    )

    return returnValue
  })

  return {
    destroy: () => {
      enhanced.destroy()
    },
  }
}

const uploadFile = async (file: File, opts: SupabaseUploadOptions & BunnyUploadOptions) => {
  if (file.type.startsWith('image/')) {
    await uploadFileToSupabase(file, opts)
  } else if (file.type.startsWith('video/')) {
    await uploadVideoToBunny(file, opts)
  }
}

interface SupabaseUploadOptions {
  accessToken: string
  folderName: string
  onError: EnhanceFileUploadOptions['onError']
  onProgress: EnhanceFileUploadOptions['onProgress']
  supabase: App.PageData['supabase']
}

const uploadFileToSupabase = async (file: File, opts: SupabaseUploadOptions) => {
  if (opts.supabase == null) {
    throw new Error('Supabase is not defined')
  }

  try {
    await uploadTus(file, opts)
  } catch (exception) {
    const { error } = await opts.supabase.storage.from('uploads').upload(`${opts.folderName}/${file.name}`, file)

    if (error != null) {
      opts.onError?.(error.message)
      throw error
    }
  }
}

const uploadTus = async (file: File, { accessToken, folderName, onProgress }: SupabaseUploadOptions) => {
  await new Promise((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: `${PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true, // Important if you want to allow re-uploading the same file https://github.com/tus/tus-js-client/blob/main/docs/api.md#removefingerprintonsuccess
      metadata: {
        bucketName: 'uploads',
        objectName: `${folderName}/${file.name}`,
        contentType: file.type,
        cacheControl: '3600',
      },
      chunkSize: 6 * 1024 * 1024, // NOTE: it must be set to 6MB (for now) do not change it
      onError: function (error) {
        reject(error)
      },
      onProgress: function (bytesUploaded, bytesTotal) {
        const percentage = (bytesUploaded / bytesTotal) * 100
        onProgress?.(percentage)
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

interface BunnyUploadOptions {
  formData: FormData
  onProgress: EnhanceFileUploadOptions['onProgress']
}

const uploadVideoToBunny = async (file: File, { formData, onProgress }: BunnyUploadOptions) => {
  const { expirationTime, signature, video } = await upfetch('/api/files/videos', {
    method: 'POST',
    schema: CreateVideoResponseSchema,
  })

  if (video.guid == null) {
    throw new Error('Video guid is null')
  }

  formData.append('bunnyVideoIds', video.guid)

  await uploadVideo({
    collectionId: video.collectionId,
    expirationTime,
    file,
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type,
    libraryId: video.videoLibraryId,
    signature,
    videoId: video.guid,
    onProgress(bytesSent, bytesTotal) {
      onProgress?.((bytesSent / bytesTotal) * 100)
    },
  })
}
