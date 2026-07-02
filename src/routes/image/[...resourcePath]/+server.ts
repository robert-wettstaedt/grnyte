import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import { files } from '$lib/db/schema'
import { getImageProvider, type ImagePayload } from '$lib/images/provider.server'
import { error } from '@sveltejs/kit'
import { eq } from 'drizzle-orm'

// Only these client headers are safe to forward upstream (partial/range +
// content negotiation); auth, cookies, etc. must not leak to the storage backend.
const FORWARDED_HEADERS = ['accept', 'range']

export async function GET({ locals, request, params, url }) {
  // The DB stores paths with a leading slash; the URL segment may or may not.
  const resourcePath = params.resourcePath.startsWith('/') ? params.resourcePath : `/${params.resourcePath}`

  // `?w=` asks for a small, cacheable thumbnail instead of the full-res original.
  // Clamped so a caller can't request an arbitrarily large render.
  const widthRaw = Number(url.searchParams.get('w'))
  const width = Number.isFinite(widthRaw) && widthRaw > 0 ? Math.min(Math.round(widthRaw), 1024) : undefined

  const rls = await createDrizzleSupabaseClient(locals.supabase)

  return await rls(async (db) => {
    // RLS scopes this lookup to files the current user is allowed to read, so a
    // missing row is indistinguishable from "not authorized" — both are a 404.
    const file = await db.query.files.findFirst({
      columns: { id: true },
      where: eq(files.path, resourcePath),
    })

    if (file == null) {
      error(404, 'File not found')
    }

    const provider = getImageProvider()
    const loadOriginal = () =>
      provider
        .fetchOriginal(resourcePath, { requestHeaders: forwardedHeaders(request), signal: request.signal })
        .catch((err) => {
          console.error(`Failed to load "${resourcePath}":`, err)
          error(502, 'Failed to load file')
        })

    let payload: ImagePayload
    let immutable = false

    if (width == null) {
      payload = await loadOriginal()
    } else {
      // A thumbnail miss (e.g. a file the backend can't preview) falls back to the
      // original, so the consumer still gets an image rather than a broken one.
      payload = await provider.fetchThumbnail(resourcePath, { width, signal: request.signal }).catch((err) => {
        console.error(`Thumbnail failed, serving original for "${resourcePath}":`, err)
        return loadOriginal()
      })
      immutable = true
    }

    const resHeaders = new Headers(payload.headers)
    resHeaders.delete('Set-Cookie')

    if (immutable) {
      // Derived and stable per (path, width): cache hard, but still private since
      // the underlying asset is RLS-gated.
      resHeaders.set('Cache-Control', 'private, max-age=604800, immutable')
    } else if (!resHeaders.has('Cache-Control')) {
      // Private, RLS-gated assets: browser-cacheable per session, never by shared proxies.
      resHeaders.set('Cache-Control', 'private, max-age=3600')
    }

    return new Response(payload.data, {
      headers: resHeaders,
      status: payload.status,
      statusText: payload.statusText,
    })
  })
}

/** Client headers safe to relay to the storage backend. */
function forwardedHeaders(request: Request): Record<string, string> {
  const headers: Record<string, string> = {}
  for (const [key, value] of request.headers) {
    if (FORWARDED_HEADERS.includes(key.toLowerCase())) {
      headers[key] = value
    }
  }
  return headers
}
