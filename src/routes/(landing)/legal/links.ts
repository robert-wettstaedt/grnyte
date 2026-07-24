import { resolve } from '$app/paths'
import { m } from '$lib/paraglide/messages'

/**
 * The legal pages in footer/settings order. A function (not a const) so the labels resolve against
 * the active locale each time it is called. Shared by the legal footer and the settings page.
 */
export const legalLinks = () => [
  { href: resolve('/legal/privacy'), label: m.legal_layout_001() },
  { href: resolve('/legal/terms'), label: m.legal_layout_002() },
  { href: resolve('/legal/cookies'), label: m.legal_layout_003() },
  { href: resolve('/legal/disclaimer'), label: m.legal_disclaimer_title() },
]
