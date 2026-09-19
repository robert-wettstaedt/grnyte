import { PUBLIC_BUNNY_STREAM_HOSTNAME, PUBLIC_BUNNY_STREAM_LIBRARY_ID } from '$env/static/public'

/**
 * Bunny Stream URLs, keyed by the video GUID (which is `bunnyStreams.id` /
 * `files.bunnyStreamFk`). The pull-zone hostname serves the CDN derivatives
 * (animated preview, still poster, MP4 renditions) directly; the iframe embed
 * is the guaranteed-playable fallback when a CDN render 403s/404s.
 *
 * EVERY url here is authorised by Referer. The pull zone has hotlink protection: measured against
 * the same poster, a request carrying `Referer: https://grnyte.rocks/` (or the dev origin) answers
 * 200 and one carrying none answers 403, whatever the method. That works today only because
 * nothing sets a referrer policy, so the browser default sends the origin. Two consequences:
 * a fetch from anything that sends no Referer (a server, a crawler, an unfurl) gets 403 and must
 * send one explicitly, and adding `Referrer-Policy: no-referrer` or a CSP that strips it silently
 * breaks every poster, preview, playlist and iframe at once with no code change to blame.
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
