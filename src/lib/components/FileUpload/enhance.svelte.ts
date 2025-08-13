import { page } from '$app/state'
import { PUBLIC_SUPABASE_URL } from '$env/static/public'
import { uploadVideo } from '$lib/bunny'
import { enhance, type EnhanceState } from '$lib/forms/enhance.svelte'
import type { RemoteQuery, RemoteQueryOverride } from '@sveltejs/kit'
import * as tus from 'tus-js-client'
import { createBunnyVideo } from './bunny.remote'

export function enhanceWithFile(state: EnhanceState) {
  return async function ({
    data,
    submit,
  }: {
    data: FormData
    submit: () => Promise<void> & {
      updates: (...queries: Array<RemoteQuery<any> | RemoteQueryOverride>) => Promise<void>
    }
  }) {
    let folderName = data.get('folderName')

    const files = data
      .getAll('files')
      .filter((file) => file instanceof File)
      .filter((file) => file.size > 0)
    data.delete('files')

    if (page.data.session?.access_token == null || files.length === 0) {
      return enhance(state, submit)
    }

    if (typeof folderName === 'string' && folderName.length > 0) {
      return enhance(state, submit)
    }

    folderName = `${page.data.session.user.id}-${Date.now()}`
    data.set('folderName', folderName)

    state.loading = true
    state.progress = 0
    state.error = undefined

    await Promise.all(files.map((file) => uploadFile(file, { folderName, formData: data, state })))

    return enhance(state, submit)
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
  folderName: string
  state: EnhanceState
}

const uploadFileToSupabase = async (file: File, opts: SupabaseUploadOptions) => {
  if (page.data.supabase == null) {
    throw new Error('Supabase is not defined')
  }

  try {
    await uploadTus(file, opts)
  } catch (exception) {
    const { error } = await page.data.supabase.storage.from('uploads').upload(`${opts.folderName}/${file.name}`, file)

    if (error != null) {
      opts.state.error = error.message
      throw error
    }
  }
}

const uploadTus = async (file: File, { folderName, state }: SupabaseUploadOptions) => {
  await new Promise((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: `${PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${page.data.session?.access_token}`,
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
        state.progress = percentage
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
  state: EnhanceState
}

const uploadVideoToBunny = async (file: File, { formData, state }: BunnyUploadOptions) => {
  const { expirationTime, signature, video } = await createBunnyVideo()

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
      state.progress = (bytesSent / bytesTotal) * 100
    },
  })
}
