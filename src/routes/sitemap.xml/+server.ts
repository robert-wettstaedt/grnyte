import { resolve } from '$app/paths'
import { legalLinks } from '../(landing)/legal/links'
import type { RequestHandler } from './$types'

/**
 * Every page an anonymous visitor may open, and nothing else: the app itself is private, and
 * `/auth` is a form nobody should arrive at from a search result.
 *
 * The legal pages come from `legalLinks()`, the same list the footers render, so a page added there
 * appears here without a second edit. `/legal/cookies` is deliberately not in it, and belongs out of
 * a sitemap anyway: it is a 308 to the privacy notice, which is already listed.
 *
 * No `lastmod`, `changefreq` or `priority`. The first would need a real edit date per page, which
 * nothing records, and a made-up one is worse than none. The other two are ignored by every major
 * crawler.
 *
 * One entry per page rather than one per locale: the locale comes from a cookie or the
 * Accept-Language header (see the paraglide strategy in vite.config.ts), never from the URL, so
 * both translations of a page live at the same address and there is nothing to alternate between.
 */
export const GET: RequestHandler = ({ url }) => {
  const paths = [resolve('/'), resolve('/help/faq'), ...legalLinks().map((link) => link.href)]

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map((path) => `  <url><loc>${url.origin}${path}</loc></url>`).join('\n')}
</urlset>
`

  return new Response(body, {
    headers: {
      'cache-control': 'public, max-age=3600',
      'content-type': 'application/xml; charset=utf-8',
    },
  })
}
