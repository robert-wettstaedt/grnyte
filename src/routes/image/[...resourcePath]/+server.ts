import { db as adminDb, createDrizzleSupabaseClient } from '$lib/db/db.server'
import { files } from '$lib/db/schema'
import { DERIVATIVE_SIZES } from '$lib/images/derivatives'
import { getImageProvider, type ImagePayload } from '$lib/images/provider.server'
import { error } from '@sveltejs/kit'
import { and, eq } from 'drizzle-orm'

// Only these client headers are safe to forward upstream (partial/range +
// content negotiation); auth, cookies, etc. must not leak to the storage backend.
const FORWARDED_HEADERS = ['accept', 'range']

// Largest render we serve, and the size anonymous (public-file) requests are forced to:
// originals keep their EXIF (incl. GPS), derivatives are re-encoded webp with none.
const MAX_WIDTH = DERIVATIVE_SIZES[1]

export async function GET({ locals, request, params, url }) {
  // The DB stores paths with a leading slash; the URL segment may or may not.
  const resourcePath = params.resourcePath.startsWith('/') ? params.resourcePath : `/${params.resourcePath}`

  // `?w=` asks for a small, cacheable thumbnail instead of the full-res original.
  // Clamped so a caller can't request an arbitrarily large render.
  const widthRaw = Number(url.searchParams.get('w'))
  const width = Number.isFinite(widthRaw) && widthRaw > 0 ? Math.min(Math.round(widthRaw), MAX_WIDTH) : undefined

  // For a signed-in user, RLS scopes this lookup to files they're allowed to read (region
  // membership + own-ascent grants), so a missing row is indistinguishable from "not
  // authorized". We only take the RLS path when there's a session: the anon Postgres role
  // has no table grants, so querying as anon errors rather than returning nothing.
  let authorized = false
  if (locals.session != null) {
    const rls = await createDrizzleSupabaseClient(locals.supabase)
    authorized = await rls(
      async (db) =>
        (await db.query.files.findFirst({ columns: { id: true }, where: eq(files.path, resourcePath) })) != null,
    )
  }

  // A `visibility: 'public'` file is world-readable (what the /f/<id> share page relies on
  // for anon visitors), and RLS hides those from non-members too, so fall back to a
  // privileged lookup that ONLY matches public rows. Private files stay members-only.
  // (Paths can repeat across rows; any row that grants access unlocks the bytes.)
  if (!authorized) {
    const publicFile = await adminDb.query.files.findFirst({
      columns: { id: true },
      where: and(eq(files.path, resourcePath), eq(files.visibility, 'public')),
    })

    if (publicFile == null) {
      error(404, 'File not found')
    }
  }

  // Anonymous / non-member requests reached the bytes only via the public-visibility
  // fallback. They must never receive the untouched original — it carries EXIF (incl. the
  // GPS coordinates of a private crag) — so they only ever get a re-encoded derivative.
  // Signed-in members with real RLS access still get the original.
  const effectiveWidth = authorized ? width : (width ?? MAX_WIDTH)

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

  if (effectiveWidth == null) {
    payload = await loadOriginal()
  } else {
    // A thumbnail miss (e.g. a file the backend can't preview) falls back to the
    // original, so the consumer still gets an image rather than a broken one — except
    // for public (anon) access, where the original would leak EXIF, so that 502s instead.
    payload = await provider
      .fetchThumbnail(resourcePath, { width: effectiveWidth, signal: request.signal })
      .catch((err) => {
        console.error(`Thumbnail failed for "${resourcePath}":`, err)
        if (!authorized) {
          error(502, 'Failed to load file')
        }
        return loadOriginal()
      })
    immutable = true
  }

  const resHeaders = new Headers(payload.headers)
  resHeaders.delete('Set-Cookie')

  if (immutable) {
    // Derived and stable per (path, width): cache hard, but still private since the
    // underlying asset is access-gated (public files are served here too, but keeping
    // it private-cacheable is the safe default).
    resHeaders.set('Cache-Control', 'private, max-age=604800, immutable')
  } else if (!resHeaders.has('Cache-Control')) {
    // Access-gated assets: browser-cacheable per session, never by shared proxies.
    resHeaders.set('Cache-Control', 'private, max-age=3600')
  }

  return new Response(payload.data, {
    headers: resHeaders,
    status: payload.status,
    statusText: payload.statusText,
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
