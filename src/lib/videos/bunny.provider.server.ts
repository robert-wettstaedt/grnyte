/**
 * Bunny Stream implementation of {@link VideoProvider}: the only module that
 * talks to the Bunny API. Videos are filed into one collection per user,
 * named by auth uid (the convention already present in the shared library).
 */
import { BUNNY_STREAM_API_KEY, BUNNY_STREAM_READ_ONLY_KEY } from '$env/static/private'
import { PUBLIC_BUNNY_STREAM_LIBRARY_ID } from '$env/static/public'
import type { HostAnswer, VideoReadiness } from '$lib/entities/file/dto'
import { formError } from '$lib/forms/schemas'
import { error } from '@sveltejs/kit'
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import type { VideoProvider, VideoUploadAuth } from './provider.server'

const API_BASE = `https://video.bunnycdn.com/library/${PUBLIC_BUNNY_STREAM_LIBRARY_ID}`

/** Title given to a freshly created video; Bunny replaces it with the file's
 *  metadata title once the TUS upload starts. A video still carrying this prefix
 *  never began uploading, so it is a safe-to-delete orphan even in a library
 *  shared with other tenants (a successful video of anyone's never keeps it). */
const PREPARED_TITLE_PREFIX = 'prepared-'

/** Bunny's webhook status enum. Absent keys say nothing about playability. `3` is Finished here and
 *  Transcoding in {@link API_READINESS}. */
const WEBHOOK_READINESS: Record<number, VideoReadiness> = {
  0: 'pending', // Queued
  1: 'pending', // Processing
  2: 'pending', // Encoding
  3: 'ready', // Finished
  4: 'ready', // ResolutionFinished: playable already, later renditions still running
  5: 'failed', // Failed
}

/** Bunny's video API status enum, which numbers the same fact differently. It collides with
 *  {@link WEBHOOK_READINESS} on `3` and `4`. */
const API_READINESS: Record<number, VideoReadiness> = {
  0: 'pending', // Created
  1: 'pending', // Uploaded
  2: 'pending', // Processing
  3: 'pending', // Transcoding
  4: 'ready', // Finished
  5: 'failed', // Error
  6: 'failed', // UploadFailed
}

/** Presigned TUS auth: sha256 hex over libraryId + apiKey + expiration + videoId.
 *  `expiration` is a unix timestamp in SECONDS. Milliseconds silently 401. */
const tusSignature = (videoId: string, expiration: number): string =>
  createHash('sha256')
    .update(`${PUBLIC_BUNNY_STREAM_LIBRARY_ID}${BUNNY_STREAM_API_KEY}${expiration}${videoId}`)
    .digest('hex')

/** Ownership proof handed out with the presigned upload and checked at finalize,
 *  keyed on the API key, so only the server can mint one for a given user+video. */
const uploadToken = (videoId: string, ownerId: string): string =>
  createHash('sha256').update(`${BUNNY_STREAM_API_KEY}:${videoId}:${ownerId}`).digest('hex')

async function bunnyFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { AccessKey: BUNNY_STREAM_API_KEY, 'Content-Type': 'application/json' },
  })
  if (!response.ok) {
    error(502, formError('media_videoServiceFailed'))
  }
  return response.json() as Promise<T>
}

/** ownerId → collection guid. One lookup per user per process, which also keeps the
 *  find-or-create from ever paging past Bunny's 100-item search response. */
const collections = new Map<string, string>()

/** Find-or-create the user's collection. */
async function collectionOf(ownerId: string): Promise<string> {
  const cached = collections.get(ownerId)
  if (cached != null) {
    return cached
  }
  const { items } = await bunnyFetch<{ items?: { guid: string; name: string }[] }>(
    `/collections?search=${ownerId}&itemsPerPage=100`,
  )
  // ponytail: two concurrent first uploads can race a duplicate collection:
  // harmless (collections are grouping only), not worth coordinating.
  const guid =
    items?.find((item) => item.name === ownerId)?.guid ??
    (
      await bunnyFetch<{ guid: string }>('/collections', {
        body: JSON.stringify({ name: ownerId }),
        method: 'POST',
      })
    ).guid
  collections.set(ownerId, guid)
  return guid
}

export const getBunnyVideoProvider = (): VideoProvider => ({
  /** The placeholder title is replaced by the `title` metadata once the TUS upload starts. */
  async createUpload(ownerId): Promise<VideoUploadAuth> {
    const collectionId = await collectionOf(ownerId)
    const { guid } = await bunnyFetch<{ guid: string }>('/videos', {
      body: JSON.stringify({ collectionId, title: `${PREPARED_TITLE_PREFIX}${new Date().toISOString()}` }),
      method: 'POST',
    })
    // Generous window: a 2GB upload on a crag connection plus retries must
    // outlive it (Bunny recommends >= 1h; an expired signature 401s mid-upload).
    const expiration = Math.floor(Date.now() / 1000) + 24 * 60 * 60
    return { expiration, signature: tusSignature(guid, expiration), token: uploadToken(guid, ownerId), videoId: guid }
  },

  async listStaleUploads(before): Promise<string[]> {
    const perPage = 100
    const stale: string[] = []
    for (let page = 1; ; page++) {
      const { items, totalItems } = await bunnyFetch<{
        items?: { dateUploaded: string; guid: string; status: number; title: string }[]
        totalItems: number
      }>(`/videos?page=${page}&itemsPerPage=${perPage}`)
      if (items == null || items.length === 0) {
        break
      }
      for (const item of items) {
        // status 0 = Created, never received bytes: the ONE state that can't be a
        // real video (any upload moves it past 0), so it's safe even in a library
        // shared with another instance. Title prefix is a second guard. dateUploaded
        // is the record's creation time (set at POST, not on upload).
        if (item.status === 0 && item.title.startsWith(PREPARED_TITLE_PREFIX) && new Date(item.dateUploaded) < before) {
          stale.push(item.guid)
        }
      }
      if (page * perPage >= totalItems) {
        break
      }
    }
    return stale
  },

  async listVideos(before): Promise<{ guids: string[]; total: number }> {
    const perPage = 100
    const guids: string[] = []
    let total = 0
    for (let page = 1; ; page++) {
      const { items, totalItems } = await bunnyFetch<{
        items?: { dateUploaded: string; guid: string }[]
        totalItems: number
      }>(`/videos?page=${page}&itemsPerPage=${perPage}`)
      if (items == null || items.length === 0) {
        break
      }
      total = totalItems
      for (const item of items) {
        // `dateUploaded` is the record's creation time (set at POST, not when bytes arrive), so it
        // ages an abandoned upload from the moment the GUID was minted.
        if (new Date(item.dateUploaded) < before) {
          guids.push(item.guid)
        }
      }
      if (page * perPage >= totalItems) {
        break
      }
    }
    return { guids, total }
  },

  readinessFromApi(status): undefined | VideoReadiness {
    return API_READINESS[status]
  },

  readinessFromWebhook(status): undefined | VideoReadiness {
    return WEBHOOK_READINESS[status]
  },

  async readinessOf(videoId): Promise<HostAnswer | undefined> {
    // The full key, although this only reads: Bunny refuses this endpoint with the read-only key.
    const response = await fetch(`${API_BASE}/videos/${videoId}`, {
      headers: { AccessKey: BUNNY_STREAM_API_KEY },
    })
    if (!response.ok) {
      // Reported, not judged. A 404 soon after an upload can be host lag, and only the caller can
      // read the upload age that tells the two apart.
      if (response.status === 404) {
        return 'gone'
      }
      // A plain Error, not Kit's `error()`: the only caller is the cron, and a stringified
      // HttpError reads "thrown with keys: status, body".
      throw new Error(`video status lookup failed with ${response.status} for ${videoId}`)
    }
    const { status } = (await response.json()) as { status?: number }
    return typeof status === 'number' ? API_READINESS[status] : undefined
  },

  async remove(videoId): Promise<void> {
    // Not bunnyFetch: DELETE returns no useful body, and a 404 (already gone)
    // is success here, not the 502 bunnyFetch would raise.
    const response = await fetch(`${API_BASE}/videos/${videoId}`, {
      headers: { AccessKey: BUNNY_STREAM_API_KEY },
      method: 'DELETE',
    })
    if (!response.ok && response.status !== 404) {
      error(502, 'The video host rejected the delete')
    }
  },

  verifyUpload(videoId, ownerId, token): boolean {
    const expected = Buffer.from(uploadToken(videoId, ownerId))
    const given = Buffer.from(token)
    return given.length === expected.length && timingSafeEqual(given, expected)
  },

  verifyWebhook(rawBody, headers): boolean {
    if (
      headers.get('X-BunnyStream-Signature-Version') !== 'v1' ||
      headers.get('X-BunnyStream-Signature-Algorithm') !== 'hmac-sha256'
    ) {
      return false
    }
    const given = headers.get('X-BunnyStream-Signature')
    // An unset secret denies, never allows. Kit resolves a missing private env member to undefined
    // in dev, so this must not assume a string.
    if (given == null || !BUNNY_STREAM_READ_ONLY_KEY) {
      return false
    }
    const expected = createHmac('sha256', BUNNY_STREAM_READ_ONLY_KEY).update(rawBody, 'utf8').digest('hex')
    const givenBuffer = Buffer.from(given.toLowerCase())
    const expectedBuffer = Buffer.from(expected)
    return givenBuffer.length === expectedBuffer.length && timingSafeEqual(givenBuffer, expectedBuffer)
  },
})
