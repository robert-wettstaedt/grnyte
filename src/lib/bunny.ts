import { upfetch } from '$lib/config'
import type { Readable } from 'stream'
import * as tus from 'tus-js-client'
import { z } from 'zod'

interface BunnyOptions {
  apiKey: string
  libraryId: string | number
}

export const captionSchema = z.object({
  /**
   * The unique srclang shortcode for the caption
   */
  srclang: z.string().nullish(),
  /**
   * The text description label for the caption
   */
  label: z.string().nullish(),
})

export const chapterSchema = z.object({
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
})

export const momentSchema = z.object({
  /**
   * The text description label for the moment
   */
  label: z.string(),
  /**
   * The timestamp of the moment in seconds
   */
  timestamp: z.number().int(),
})

export const metaTagSchema = z.object({
  /**
   * The property name of the meta tag
   */
  property: z.string().nullish(),
  /**
   * The value of the meta tag
   */
  value: z.string().nullish(),
})

export const transcodingMessageSchema = z.object({
  /**
   * The timestamp of the transcoding message
   */
  timeStamp: z.string().datetime({ local: true, offset: true }),
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
})

// Collection schema for collection-related endpoints
export const collectionSchema = z.object({
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
})

// Collections list schema with pagination
export const collectionsListSchema = z.object({
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
  items: z.array(collectionSchema).nullish(),
})

export const videoSchema = z.object({
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
  dateUploaded: z.string().datetime({ local: true, offset: true }).nullish(),
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
  captions: z.array(captionSchema).nullish(),
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
  chapters: z.array(chapterSchema).nullish(),
  /**
   * The list of moments available for the video
   */
  moments: z.array(momentSchema).nullish(),
  /**
   * The list of meta tags that have been added to the video
   */
  metaTags: z.array(metaTagSchema).nullish(),
  /**
   * The list of transcoding messages that describe potential issues while the video was transcoding
   */
  transcodingMessages: z.array(transcodingMessageSchema).nullish(),
})

export const videoPlaySchema = z.intersection(
  videoSchema,
  z.object({
    /**
     * Path to captions file
     */
    captionsPath: z.string().nullish(),
    /**
     * Path to seek file
     */
    seekPath: z.string().nullish(),
    /**
     * URL to the thumbnail
     */
    thumbnailUrl: z.string().nullish(),
    /**
     * URL to the fallback version
     */
    fallbackUrl: z.string().nullish(),
    /**
     * URL to the video playlist
     */
    videoPlaylistUrl: z.string().nullish(),
    /**
     * URL to the original video
     */
    originalUrl: z.string().nullish(),
    /**
     * URL to the preview video
     */
    previewUrl: z.string().nullish(),
    /**
     * Video player controls
     */
    controls: z.string().nullish(),
    /**
     * Whether DRM is enabled
     */
    enableDRM: z.boolean().nullish(),
    /**
     * DRM version
     */
    drmVersion: z.number().int().nullish(),
    /**
     * Color key for the player
     */
    playerKeyColor: z.string().nullish(),
    /**
     * URL for VAST tag
     */
    vastTagUrl: z.string().nullish(),
    /**
     * Font size for captions
     */
    captionsFontSize: z.number().int().nullish(),
    /**
     * Font color for captions
     */
    captionsFontColor: z.string().nullish(),
    /**
     * Background for captions
     */
    captionsBackground: z.string().nullish(),
    /**
     * UI language
     */
    uiLanguage: z.string().nullish(),
    /**
     * Whether early play is allowed
     */
    allowEarlyPlay: z.boolean().nullish(),
    /**
     * Whether token auth is enabled
     */
    tokenAuthEnabled: z.boolean().nullish(),
    /**
     * Whether MP4 fallback is enabled
     */
    enableMP4Fallback: z.boolean().nullish(),
    /**
     * Whether to show heatmap
     */
    showHeatmap: z.boolean().nullish(),
    /**
     * Font family
     */
    fontFamily: z.string().nullish(),
    /**
     * Available playback speeds
     */
    playbackSpeeds: z.string().nullish(),
  }),
)

export const statusSchema = z.object({
  page: z.object({
    id: z.string(),
    name: z.string(),
    url: z.string(),
    time_zone: z.string(),
    updated_at: z.string(),
  }),
  status: z.object({
    indicator: z.enum(['none']),
    description: z.string(),
  }),
})

async function digestMessage(message: string) {
  const msgUint8 = new TextEncoder().encode(message) // encode as (utf-8) Uint8Array
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8) // hash the message
  const hashArray = Array.from(new Uint8Array(hashBuffer)) // convert buffer to byte array
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('') // convert bytes to hex string
  return hashHex
}

interface GetCollectionsOptions extends BunnyOptions {
  search?: string
}
export const getCollections = ({ libraryId, apiKey, search }: GetCollectionsOptions) => {
  return upfetch(`https://video.bunnycdn.com/library/${libraryId}/collections`, {
    headers: {
      AccessKey: apiKey,
    },
    params: {
      search,
    },
    schema: collectionsListSchema,
  })
}

interface CreateCollectionOptions extends BunnyOptions {
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
    schema: collectionSchema,
  })
}

interface CreateVideoOptions extends BunnyOptions {
  collectionId?: string | null
  title: string
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
    schema: videoSchema,
  })
}

interface DeleteVideoOptions extends BunnyOptions {
  videoId: string
}
export const deleteVideo = async ({ libraryId, videoId, apiKey }: DeleteVideoOptions) => {
  return await upfetch(`https://video.bunnycdn.com/library/${libraryId}/videos/${videoId}`, {
    method: 'DELETE',
    headers: {
      AccessKey: apiKey,
    },
  })
}

export interface UploadVideoOptions extends Pick<BunnyOptions, 'libraryId'> {
  collectionId?: string | null
  expirationTime: number
  file: File | Blob | Readable
  fileName: string
  fileSize: number
  fileType: string
  onProgress?: tus.UploadOptions['onProgress']
  signature: string
  videoId: string
}
export const uploadVideo = async ({
  collectionId,
  expirationTime,
  file,
  fileName,
  fileSize,
  fileType,
  libraryId,
  onProgress,
  signature,
  videoId,
}: UploadVideoOptions) => {
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
        LibraryId: String(libraryId),
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

interface CreateVideoUploadSignatureOptions extends BunnyOptions {
  expirationTime: number
  videoId: string
}
export async function createVideoUploadSignature({
  apiKey,
  expirationTime,
  libraryId,
  videoId,
}: CreateVideoUploadSignatureOptions) {
  const message = libraryId + apiKey + expirationTime + videoId
  return digestMessage(message)
}

interface GetVideoOptions extends BunnyOptions {
  videoId: string
}
export const getVideo = async ({ apiKey, libraryId, videoId }: GetVideoOptions) => {
  return await upfetch(`https://video.bunnycdn.com/library/${libraryId}/videos/${videoId}`, {
    headers: {
      AccessKey: apiKey,
    },
    schema: videoPlaySchema,
  })
}

interface GetVideoThumbnailUrlOptions {
  format?: 'webp' | 'jpg'
  hostname: string
  videoId: string
}
export const getVideoThumbnailUrl = ({ format = 'webp', hostname, videoId }: GetVideoThumbnailUrlOptions) => {
  if (format === 'webp') {
    return `https://${hostname}/${videoId}/preview.webp`
  }
  return `https://${hostname}/${videoId}/thumbnail.jpg`
}

interface GetVideoIframeUrlOptions extends Pick<BunnyOptions, 'libraryId'> {
  videoId: string
}
export const getVideoIframeUrl = ({ libraryId, videoId }: GetVideoIframeUrlOptions) => {
  return `https://iframe.mediadelivery.net/embed/${libraryId}/${videoId}?autoplay=true&loop=false&muted=false&preload=true&responsive=true`
}

export const getStatus = async () => {
  return upfetch('https://status.bunny.net/api/v2/status.json', { schema: statusSchema })
}

export enum VideoStatus {
  Created = 0,
  Uploaded = 1,
  Processing = 2,
  Transcoding = 3,
  Finished = 4,
  Error = 5,
  UploadFailed = 6,
  JitSegmenting = 7,
  JitPlaylistsCreated = 8,
  Unknown = 999,
}
