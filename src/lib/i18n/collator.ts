import { getLocale } from '$lib/paraglide/runtime'

/**
 * Cached per locale, because the locale is a runtime value: paraglide can switch it mid-session,
 * so a module-level singleton would keep collating in whichever language happened to load first.
 */
const collators = new Map<string, Intl.Collator>()

/**
 * The comparator every user-visible name list sorts through.
 *
 * A bare `a.name.localeCompare(b.name)` answers two questions wrong at once. It collates in the
 * runtime's own locale rather than paraglide's, so a German reader on an English browser gets
 * English umlaut ordering; and it compares digits as characters, so "Route 10" sorts before
 * "Route 2". The numbers are not hypothetical: `blockName` falls back to "Block <order+1>", so the
 * app generates numbered names itself and then shows them out of order.
 *
 * Deliberately no `sensitivity: 'base'`: it ties "Cafe" and "Café", and these lists want a total
 * order (a sort that considers two different names equal reshuffles them as rows sync in).
 *
 * Hoist this out of the comparator when the list can be long (`nameCollator()` reads the locale,
 * which re-runs paraglide's strategy chain); use {@link compareNames} for short lists and for
 * comparisons chained behind a `||`.
 */
export function nameCollator(): Intl.Collator {
  const locale = getLocale()
  const cached = collators.get(locale)
  if (cached != null) {
    return cached
  }
  const collator = new Intl.Collator(locale, { numeric: true })
  collators.set(locale, collator)
  return collator
}

/** {@link nameCollator} as a plain comparison, for one-off use. */
export const compareNames = (a: string, b: string): number => nameCollator().compare(a, b)
