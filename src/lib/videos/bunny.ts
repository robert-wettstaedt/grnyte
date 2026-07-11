import { PUBLIC_BUNNY_STREAM_HOSTNAME, PUBLIC_BUNNY_STREAM_LIBRARY_ID } from '$env/static/public'

/**
 * Bunny Stream URLs, keyed by the video GUID (which is `bunnyStreams.id` /
 * `files.bunnyStreamFk`). The pull-zone hostname serves the CDN derivatives
 * (animated preview, still poster, MP4 renditions) directly; the iframe embed
 * is the guaranteed-playable fallback when a CDN render 403s/404s.
 */
const cdn = (guid: string, file: string) => `https://${PUBLIC_BUNNY_STREAM_HOSTNAME}/${guid}/${file}`

/** Animated, gif-like WebP preview, the grid tile for a video. */
export const bunnyPreview = (guid: string) => cdn(guid, 'preview.webp')

/** Still poster frame, the preview's own fallback. */
export const bunnyThumbnail = (guid: string) => cdn(guid, 'thumbnail.jpg')

/** HLS master playlist (adaptive bitrate); the source for the native `<video>` player. */
export const bunnyHls = (guid: string) => cdn(guid, 'playlist.m3u8')

/** The always-works iframe player; autoplays. Fallback when the MP4 fails to load. */
export const bunnyIframe = (guid: string) =>
  `https://iframe.mediadelivery.net/embed/${PUBLIC_BUNNY_STREAM_LIBRARY_ID}/${guid}?autoplay=true`
