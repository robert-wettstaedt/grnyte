import { page } from '$app/state'
import { PUBLIC_SUPABASE_URL } from '$env/static/public'
import { uploadVideo } from '$lib/bunny'
import type { EnhanceState } from '$lib/forms/enhance.svelte'
import * as tus from 'tus-js-client'
import { createBunnyVideo } from './bunny.remote'

export async function processFileUpload(form: HTMLFormElement, state: EnhanceState) {
  const fileFields = Array.from(form.querySelectorAll('[type="file"]'))
  const files = fileFields
    .flatMap((field) => Array.from((field as HTMLInputElement).files ?? []))
    .filter((file) => file instanceof File)
    .filter((file) => file.size > 0)

  if (page.data.session?.access_token == null || files.length === 0) {
    return
  }

  state.loading = true
  state.progress = 0
  state.error = undefined

  await Promise.all(files.map((file) => uploadFile(file, state)))
}

const uploadFile = async (file: File, state: EnhanceState) => {
  if (file.type.startsWith('image/')) {
    await uploadFileToSupabase(file, state)
  } else if (file.type.startsWith('video/')) {
    await uploadVideoToBunny(file, state)
  }
}

const uploadFileToSupabase = async (file: File, state: EnhanceState) => {
  if (page.data.supabase == null) {
    throw new Error('Supabase is not defined')
  }

  const folderName = `${page.data.session?.user.id}-${Date.now()}`
  state.additionalFields = { ...state.additionalFields, folderName }

  try {
    await uploadTus(file, state, folderName)
  } catch (exception) {
    const { error } = await page.data.supabase.storage.from('uploads').upload(`${folderName}/${file.name}`, file)

    if (error != null) {
      state.error = error.message
      throw error
    }
  }
}

const uploadTus = async (file: File, state: EnhanceState, folderName: string) => {
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

const uploadVideoToBunny = async (file: File, state: EnhanceState) => {
  const { expirationTime, signature, video } = await createBunnyVideo()

  if (video.guid == null) {
    throw new Error('Video guid is null')
  }

  state.additionalFields = { ...state.additionalFields, bunnyVideoIds: video.guid }

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
