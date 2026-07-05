import { getBunnyVideoProvider } from './bunny.provider.server'

/** Credentials the browser attaches to its direct (TUS) upload of one video. */
export interface VideoUploadAuth {
  /** Provider-side id of the created video object — doubles as `bunnyStreams.id`. */
  videoId: string
  signature: string
  /** Unix timestamp in seconds the signature expires at. */
  expiration: number
  /** Ownership proof for `finalizeVideo` — see {@link VideoProvider.verifyUpload}. */
  token: string
}

/**
 * The app's single video-hosting boundary, mirroring {@link ImageProvider}.
 * Unlike images the server never touches video bytes — the browser uploads
 * directly to the host — so the boundary covers the API side only: creating
 * the remote video object and presigning its upload. The active implementation
 * fully encapsulates its backend (nothing else in the app calls the Bunny
 * API), so swapping hosts is one new implementation plus a change to
 * {@link getVideoProvider} — plus the client transport in `VideoUpload`,
 * which is inherently host-specific.
 */
export interface VideoProvider {
  /** Create a video object grouped under the uploading user, presigned for a direct browser upload. */
  createUpload(ownerId: string): Promise<VideoUploadAuth>
  /**
   * Whether `token` proves {@link createUpload} minted `videoId` for `ownerId`.
   * The GUID at finalize is client-supplied — without this check any authed
   * user could attach a made-up or foreign video to their own ascent.
   */
  verifyUpload(videoId: string, ownerId: string, token: string): boolean
}

/** The video provider the app is configured to use. Swap the backend here. */
export const getVideoProvider = (): VideoProvider => getBunnyVideoProvider()
