import type { HostAnswer, VideoReadiness } from '$lib/entities/file/dto'
import { getBunnyVideoProvider } from './bunny.provider.server'

/**
 * The app's single video-hosting boundary, mirroring {@link ImageProvider}.
 * Unlike images, the server never touches video bytes. The browser uploads
 * directly to the host, so the boundary covers the API side only: creating
 * the remote video object and presigning its upload. The active implementation
 * fully encapsulates its backend (nothing else in the app calls the Bunny
 * API), so swapping hosts is one new implementation plus a change to
 * {@link getVideoProvider}, plus the client transport in `VideoUpload`,
 * which is inherently host-specific.
 */
export interface VideoProvider {
  /** Create a video object grouped under the uploading user, presigned for a direct browser upload. */
  createUpload(ownerId: string): Promise<VideoUploadAuth>
  /**
   * GUIDs of created-but-never-started uploads older than `before` (orphans
   * from abandoned forms). Identified by never having received bytes (Bunny
   * status 0) plus the placeholder title, so it can never match a real video and
   * is safe even when the library is shared with another instance. Mid-upload
   * aborts are left (they moved past status 0).
   */
  listStaleUploads(before: Date): Promise<string[]>
  /**
   * Every video older than `before`, plus the library's total size. Facts only: deciding which of
   * these is an orphan needs the database, which this module deliberately cannot reach. The total
   * is there so the caller can refuse a sweep that would take an implausible share of the library.
   */
  listVideos(before: Date): Promise<{ guids: string[]; total: number }>
  /**
   * A video API status as readiness, or `undefined` when it says nothing about playability. Separate
   * from {@link readinessFromWebhook}, where `3` means Finished rather than Transcoding.
   */
  readinessFromApi(status: number): undefined | VideoReadiness
  /**
   * A webhook status as readiness, or `undefined` for events that are not about playability. The two
   * enums collide on `3` and `4`, so reading one with {@link readinessFromApi} is silently wrong.
   */
  readinessFromWebhook(status: number): undefined | VideoReadiness
  /**
   * What the host says about one video: a readiness, `gone` when it has no record, or `undefined`
   * when the status says nothing about playability. `gone` rather than `failed`, because whether an
   * absence is terminal depends on the upload age, which only the caller can read.
   */
  readinessOf(videoId: string): Promise<HostAnswer | undefined>
  /** Delete the hosted video. Idempotent: an already-gone video is not an error. */
  remove(videoId: string): Promise<void>
  /**
   * Whether `token` proves {@link createUpload} minted `videoId` for `ownerId`.
   * The GUID at finalize is client-supplied: without this check any authed
   * user could attach a made-up or foreign video to their own ascent.
   */
  verifyUpload(videoId: string, ownerId: string, token: string): boolean
  /**
   * Whether this really came from the video host. Takes the raw body, because the signature covers
   * the exact bytes sent.
   */
  verifyWebhook(rawBody: string, headers: Headers): boolean
}

/** Credentials the browser attaches to its direct (TUS) upload of one video. */
export interface VideoUploadAuth {
  /** Unix timestamp in seconds the signature expires at. */
  expiration: number
  signature: string
  /** Ownership proof for `finalizeVideo`: see {@link VideoProvider.verifyUpload}. */
  token: string
  /** Provider-side id of the created video object: doubles as `bunnyStreams.id`. */
  videoId: string
}

/** The video provider the app is configured to use. Swap the backend here. */
export const getVideoProvider = (): VideoProvider => getBunnyVideoProvider()
