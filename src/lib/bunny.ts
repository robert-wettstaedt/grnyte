import type { Readable } from 'stream'
import * as tus from 'tus-js-client'
import { up } from 'up-fetch'
import { z } from 'zod'

const upfetch = up(fetch)

interface BunnyOptions {
  apiKey: string
}

interface GetCollectionsOptions extends BunnyOptions {
  libraryId: string
}
export const getCollections = ({ libraryId, apiKey }: GetCollectionsOptions) => {
  return upfetch(`https://video.bunnycdn.com/library/${libraryId}/collections`, {
    headers: {
      AccessKey: apiKey,
    },
    schema: z.object({
      /**
       * The total number of items that can be returned
       */
      totalItems: z.number().int(),
      /**
       * The current page of the response
       */
      currentPage: z.number().int(),
      /**
       * The number of items returned per page
       */
      itemsPerPage: z.number().int(),
      /**
       * The result items on the current result
       */
      items: z
        .array(
          z.object({
            /**
             * The video library ID that contains the collection
             */
            videoLibraryId: z.number().int(),
            /**
             * The unique ID of the collection
             */
            guid: z.string().nullish(),
            /**
             * The name of the collection
             */
            name: z.string().nullish(),
            /**
             * The number of videos that the collection contains
             */
            videoCount: z.number().int(),
            /**
             * The total storage size of the collection
             */
            totalSize: z.number().int(),
            /**
             * The IDs of videos to be used as preview icons
             */
            previewVideoIds: z.string().nullish(),
            /**
             * The URLs of preview images of videos in the collection
             */
            previewImageUrls: z.array(z.string()).nullish(),
          }),
        )
        .nullish(),
    }),
  })
}

interface CreateCollectionOptions extends BunnyOptions {
  libraryId: string
  name: string
}
export const createCollection = ({ libraryId, name, apiKey }: CreateCollectionOptions) => {
  return upfetch(`https://video.bunnycdn.com/library/${libraryId}/collections`, {
    method: 'POST',
    headers: {
      AccessKey: apiKey,
    },
    body: {
      name,
    },
    schema: z.object({
      /**
       * The video library ID that contains the collection
       */
      videoLibraryId: z.number().int(),
      /**
       * The unique ID of the collection
       */
      guid: z.string().nullish(),
      /**
       * The name of the collection
       */
      name: z.string().nullish(),
      /**
       * The number of videos that the collection contains
       */
      videoCount: z.number().int(),
      /**
       * The total storage size of the collection
       */
      totalSize: z.number().int(),
      /**
       * The IDs of videos to be used as preview icons
       */
      previewVideoIds: z.string().nullish(),
      /**
       * The URLs of preview images of videos in the collection
       */
      previewImageUrls: z.array(z.string()).nullish(),
    }),
  })
}

interface CreateVideoOptions extends BunnyOptions {
  libraryId: string
  title: string
  collectionId?: string | null
}
export const createVideo = async ({ libraryId, title, apiKey, collectionId }: CreateVideoOptions) => {
  return await upfetch(`https://video.bunnycdn.com/library/${libraryId}/videos`, {
    method: 'POST',
    headers: {
      AccessKey: apiKey,
    },
    body: {
      title,
      collectionId,
    },
    schema: z.object({
      /**
       * The ID of the video library that the video belongs to
       */
      videoLibraryId: z.number().int(),
      /**
       * The unique ID of the video
       */
      guid: z.string().nullish(),
      /**
       * The title of the video
       */
      title: z.string().nullish(),
      /**
       * The date when the video was uploaded
       */
      dateUploaded: z.string().datetime(),
      /**
       * The number of views the video received
       */
      views: z.number().int(),
      /**
       * Determines if the video is publically accessible
       */
      isPublic: z.boolean(),
      /**
       * The duration of the video in seconds
       */
      length: z.number().int(),
      /**
       * The status of the video
       * 0 = Created, 1 = Uploaded, 2 = Processing, 3 = Transcoding,
       * 4 = Finished, 5 = Error, 6 = UploadFailed, 7 = JitSegmenting, 8 = JitPlaylistsCreated
       */
      status: z.number().int(),
      /**
       * The framerate of the video
       */
      framerate: z.number(),
      /**
       * The rotation of the video
       */
      rotation: z.number().int().nullish(),
      /**
       * The width of the original video file
       */
      width: z.number().int(),
      /**
       * The height of the original video file
       */
      height: z.number().int(),
      /**
       * The available resolutions of the video
       */
      availableResolutions: z.string().nullish(),
      /**
       * Encoded output codecs of the video
       */
      outputCodecs: z.string().nullish(),
      /**
       * The number of thumbnails generated for this video
       */
      thumbnailCount: z.number().int(),
      /**
       * The current encode progress of the video
       */
      encodeProgress: z.number().int(),
      /**
       * The amount of storage used by this video
       */
      storageSize: z.number().int(),
      /**
       * The list of captions available for the video
       */
      captions: z
        .array(
          z.object({
            /**
             * The unique srclang shortcode for the caption
             */
            srclang: z.string().nullish(),
            /**
             * The text description label for the caption
             */
            label: z.string().nullish(),
          }),
        )
        .nullish(),
      /**
       * Determines if the video has MP4 fallback files generated
       */
      hasMP4Fallback: z.boolean(),
      /**
       * The ID of the collection where the video belongs
       */
      collectionId: z.string().nullish(),
      /**
       * The file name of the thumbnail inside of the storage
       */
      thumbnailFileName: z.string().nullish(),
      /**
       * The average watch time of the video in seconds
       */
      averageWatchTime: z.number().int(),
      /**
       * The total video watch time in seconds
       */
      totalWatchTime: z.number().int(),
      /**
       * The automatically detected category of the video
       */
      category: z.string().nullish(),
      /**
       * The list of chapters available for the video
       */
      chapters: z
        .array(
          z.object({
            /**
             * The title of the chapter
             */
            title: z.string(),
            /**
             * The start time of the chapter in seconds
             */
            start: z.number().int(),
            /**
             * The end time of the chapter in seconds
             */
            end: z.number().int(),
          }),
        )
        .nullish(),
      /**
       * The list of moments available for the video
       */
      moments: z
        .array(
          z.object({
            /**
             * The text description label for the moment
             */
            label: z.string(),
            /**
             * The timestamp of the moment in seconds
             */
            timestamp: z.number().int(),
          }),
        )
        .nullish(),
      /**
       * The list of meta tags that have been added to the video
       */
      metaTags: z
        .array(
          z.object({
            /**
             * The property name of the meta tag
             */
            property: z.string().nullish(),
            /**
             * The value of the meta tag
             */
            value: z.string().nullish(),
          }),
        )
        .nullish(),
      /**
       * The list of transcoding messages that describe potential issues while the video was transcoding
       */
      transcodingMessages: z
        .array(
          z.object({
            /**
             * The timestamp of the transcoding message
             */
            timeStamp: z.string().datetime(),
            /**
             * The level of the message (0 = Undefined, 1 = Information, 2 = Warning, 3 = Error)
             */
            level: z.number().int(),
            /**
             * The issue code of the message
             * 0 = Undefined, 1 = StreamLengthsDifference, 2 = TranscodingWarnings,
             * 3 = IncompatibleResolution, 4 = InvalidFramerate, 5 = VideoExceededMaxDuration,
             * 6 = AudioExceededMaxDuration, 7 = OriginalCorrupted, 8 = TranscriptionFailed,
             * 9 = JitIncompatible, 10 = JitFailed
             */
            issueCode: z.number().int(),
            /**
             * The message text
             */
            message: z.string().nullish(),
            /**
             * The value associated with the message
             */
            value: z.string().nullish(),
          }),
        )
        .nullish(),
    }),
  })
}

interface UploadTusOptions {
  apiKey: string
  collectionId?: string | null
  file: Readable
  fileSize: number
  fileName: string
  fileType: string
  libraryId: string
  onProgress?: tus.UploadOptions['onProgress']
  videoId: string
}
export const uploadVideo = async ({
  apiKey,
  collectionId,
  file,
  fileSize,
  fileName,
  fileType,
  libraryId,
  onProgress,
  videoId,
}: UploadTusOptions) => {
  const expirationTime = new Date().getTime() + 1000 * 60 * 60 // 1 hour

  const signature = await digestMessage(libraryId + apiKey + expirationTime + videoId)

  const metadata: tus.UploadOptions['metadata'] = {
    filetype: fileType,
    title: fileName,
  }

  if (collectionId != null) {
    metadata.collection = collectionId
  }

  await new Promise((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: 'https://video.bunnycdn.com/tusupload',
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        AuthorizationSignature: signature, // SHA256 signature (library_id + api_key + expiration_time + video_id)
        AuthorizationExpire: String(expirationTime), // Expiration time as in the signature,
        VideoId: videoId, // The guid of a previously created video object through the Create Video API call
        LibraryId: libraryId,
      },
      metadata,
      uploadSize: fileSize,
      chunkSize: 5 * 1024 * 1024, // 5MB chunk size
      onError: function (error) {
        reject(error)
      },
      onProgress,
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

async function digestMessage(message: string) {
  const msgUint8 = new TextEncoder().encode(message) // encode as (utf-8) Uint8Array
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8) // hash the message
  const hashArray = Array.from(new Uint8Array(hashBuffer)) // convert buffer to byte array
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('') // convert bytes to hex string
  return hashHex
}
