import { resolve } from '$app/paths'
import { PUBLIC_APPLICATION_NAME, PUBLIC_REPORT_EMAIL, PUBLIC_TOPO_EMAIL } from '$env/static/public'
import { DEFAULT_MAX_MEMBERS, MAX_OWNED_REGIONS } from '$lib/entities/region/dto'
import { m } from '$lib/paraglide/messages'

/**
 * The legal pages in footer/settings order. A function (not a const) so the labels resolve against
 * the active locale each time it is called. Shared by the legal footer, the landing footer and the
 * settings page, so a page added or dropped here reaches every surface at once.
 *
 * `/legal/cookies` is deliberately absent: it redirects to the privacy notice, which now carries the
 * device-storage section. The route survives so older links keep resolving.
 */
export const legalLinks = () => [
  { href: resolve('/legal/privacy'), label: m.legal_privacy_title() },
  { href: resolve('/legal/terms'), label: m.legal_terms_title() },
  { href: resolve('/legal/disclaimer'), label: m.legal_disclaimer_title() },
  { href: resolve('/legal/report'), label: m.legal_report_title() },
  { href: resolve('/legal/imprint'), label: m.legal_imprint_title() },
]

/**
 * Substitute every token in a legal page's raw HTML.
 *
 * The copy lives in per-locale `.html` files imported `?raw`, which the compiler never looks inside.
 * A literal `href="/legal/terms"` in there is invisible to it, so a moved route would 404 silently
 * while `legalLinks` above, which goes through `resolve()`, would have failed the build. Routing the
 * cross-page links through here puts them back under the same guarantee: rename a route and this
 * file stops compiling.
 *
 * Addresses come from the environment for the same reason they do everywhere else: they differ per
 * deployment and must never be pasted into copy, and the repository URL comes from package.json
 * through `__APP_REPO__` so a fork or a rename does not leave four pages pointing at the original.
 *
 * One pass over a map rather than a chain of `replaceAll`, for two silent failures. A chain cannot
 * see a token it has no case for, so `{contactMail}` would publish literally in a legal document
 * with nothing failing; here an unknown token throws in development and is warned about in
 * production, where throwing would take a page down over a typo. And a string replacement expands
 * dollar sequences, so a dollar sign in an environment-provided address (legal in an email local
 * part) would corrupt the rendered text; a function replacement never does.
 */
export const renderLegal = (html: string): string => {
  const tokens: Record<string, string> = {
    contactEmail: PUBLIC_TOPO_EMAIL,
    disclaimerHref: resolve('/legal/disclaimer'),
    imprintHref: resolve('/legal/imprint'),
    maxMembers: String(DEFAULT_MAX_MEMBERS),
    maxRegions: String(MAX_OWNED_REGIONS),
    name: PUBLIC_APPLICATION_NAME,
    privacyHref: resolve('/legal/privacy'),
    reportEmail: PUBLIC_REPORT_EMAIL,
    reportHref: resolve('/legal/report'),
    repoUrl: __APP_REPO__,
    termsHref: resolve('/legal/terms'),
  }

  // Authored comments come out first. They are guard rails for whoever edits the copy next (which
  // clause a page cites by number, why a paragraph is worded the way it is, what was deliberately
  // left out) and `{@html}` would otherwise pass every one of them straight into the response body,
  // readable in view-source. On a legal page that is drafting strategy published to the other side.
  // Stripping before the token pass also means a commented-out token cannot throw on an unknown key.
  return html.replace(/<!--[\s\S]*?-->/g, '').replace(/\{(\w+)\}/g, (raw, key: string) => {
    const value = tokens[key]
    if (value == null) {
      if (import.meta.env.DEV) {
        throw new Error(`renderLegal: unknown token ${raw}`)
      }
      console.warn(`renderLegal: unknown token ${raw}`)
      return raw
    }
    return value
  })
}
