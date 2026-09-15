import { resolve } from '$app/paths'
import type { RequestHandler } from './$types'

/**
 * Almost nothing here is crawlable, and that is the product: every region is private and every
 * route outside the public prefixes bounces an anonymous visitor to /auth, so a crawler that
 * followed one would index a sign-in form. What is left to index is the landing page, the help
 * pages and the legal pages.
 *
 * `Disallow: /` under narrower `Allow:` lines is the standard shape: a crawler applies the longest
 * matching rule, so `/legal/imprint` matches `Allow: /legal` and is fetched while `/routes/748`
 * matches only the catch-all and is not. `Allow: /$` is the home page alone, without opening
 * everything below it.
 *
 * The two subtree lines are prefixes, not routes, which is why they are literals here and not
 * `resolve()` calls: `/help` and `/legal` have no page of their own to resolve. They mirror
 * PUBLIC_PREFIXES in `$lib/hooks/auth.server`, and that is the pairing to keep in step. A prefix
 * missing here costs indexing; a prefix missing there costs a 303 to /auth.
 *
 * Served from an endpoint rather than `static/` so the sitemap line carries the origin the request
 * arrived on. A hardcoded one would point a preview deployment's crawler at production.
 */
export const GET: RequestHandler = ({ url }) => {
  const body = `User-agent: *
Allow: ${resolve('/')}$
Allow: /help
Allow: /legal
Disallow: /

Sitemap: ${url.origin}${resolve('/sitemap.xml')}
`

  return new Response(body, {
    headers: {
      'cache-control': 'public, max-age=3600',
      'content-type': 'text/plain; charset=utf-8',
    },
  })
}
