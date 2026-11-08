import type { queries } from './queries'

/**
 * What the screens still on Zero promise offline. Zero keeps nothing on the device any more: the guidebook,
 * your logbook and the reference data sync through PowerSync.
 *
 * `excluded` is deliberately never kept: it renders as "not available offline", never as an empty list, or a
 * gap in the sync reads as a fact about the guidebook. Any other query, offline and empty, says "not downloaded".
 */

/** Deliberately never kept. */
const EXCLUDED: readonly string[] = [
  'listComments',
  'listEvents',
  'listNotifications',
  'listRouteAscents',
] satisfies (keyof typeof queries)[]

/** The policy for a query, by the name Zero carries on every request: `excluded` or nothing. */
export function offlinePolicyOf(queryName: string | undefined): 'excluded' | undefined {
  return queryName != null && EXCLUDED.includes(queryName) ? 'excluded' : undefined
}
