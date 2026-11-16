import { APP_API_PREFIX } from '$lib/hooks/auth.server'
import type { Handle } from '@sveltejs/kit'

/** Paths another site may POST to with the cookie attached; an entry ending in `/` is a prefix. */
export const CROSS_SITE_EXEMPT: readonly string[] = [
  // Apple's form_post arrives cross-site by design; it answers with a redirect and reads no session.
  '/auth/callback/apple',
  // Cookie-blind (authGuard), so a forged request there carries nothing it could use.
  APP_API_PREFIX,
]

const SUPABASE_AUTH_COOKIE = /(?:^|;\s*)sb-[^=;]+-auth-token(?:\.\d+)?=/
const SAFE_METHODS = new Set(['GET', 'HEAD'])

const isExempt = (pathname: string) =>
  CROSS_SITE_EXEMPT.some((entry) => (entry.endsWith('/') ? pathname.startsWith(entry) : pathname === entry))

/**
 * Refuses a cookie-authenticated write a browser marked as not same-origin (design decision 16).
 * Matched on `request.url`: Kit rewrites `event.url` to the calling page for a remote function.
 */
export const crossSiteGuard: Handle = async ({ event, resolve }) => {
  const { request } = event
  const site = request.headers.get('sec-fetch-site')
  if (
    SAFE_METHODS.has(request.method) ||
    site == null ||
    site === 'same-origin' ||
    !SUPABASE_AUTH_COOKIE.test(request.headers.get('cookie') ?? '') ||
    isExempt(new URL(request.url).pathname)
  ) {
    return resolve(event)
  }
  return new Response('Cross-site request refused', { headers: { 'content-type': 'text/plain' }, status: 403 })
}
