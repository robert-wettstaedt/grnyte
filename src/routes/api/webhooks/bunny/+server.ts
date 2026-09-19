import { PUBLIC_BUNNY_STREAM_LIBRARY_ID } from '$env/static/public'
import { promoteReadiness } from '$lib/entities/file/readiness.server'
import { getVideoProvider } from '$lib/videos/provider.server'
import { text } from '@sveltejs/kit'
import type { RequestHandler } from './$types'

/**
 * Bunny Stream's video status webhook, the source of truth for `bunny_streams.readiness`. Its only
 * authorisation is the signature, so it reads only the GUID and the status, and never inserts.
 * Writes are promote-only (see `readiness` in CONTEXT.md), because delivery order is not guaranteed.
 */
export const POST: RequestHandler = async ({ request }) => {
  // The raw body, because the signature covers the exact bytes sent.
  const rawBody = await request.text()
  const provider = getVideoProvider()
  if (!provider.verifyWebhook(rawBody, request.headers)) {
    return text('Unauthorized', { status: 401 })
  }

  let payload: { Status?: unknown; VideoGuid?: unknown; VideoLibraryId?: unknown }
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return text('Bad Request', { status: 400 })
  }

  // A signed request for somebody else's library is not ours to act on.
  if (String(payload.VideoLibraryId) !== PUBLIC_BUNNY_STREAM_LIBRARY_ID) {
    return new Response(null, { status: 204 })
  }
  const guid = payload.VideoGuid
  if (typeof guid !== 'string' || typeof payload.Status !== 'number') {
    return text('Bad Request', { status: 400 })
  }

  const readiness = provider.readinessFromWebhook(payload.Status)
  // Upload lifecycle, captions and metadata say nothing about playability.
  if (readiness !== undefined) {
    await promoteReadiness(guid, readiness)
  }

  return new Response(null, { status: 204 })
}
