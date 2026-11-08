import type { queries } from './queries'

/**
 * What the screens still on Zero promise offline. Zero keeps nothing on the device any more: the guidebook,
 * your logbook and the reference data sync through PowerSync.
 *
 * - `excluded`: deliberately never kept. These must render as "not available offline" and never as an empty
 *   list, or a gap in the sync reads as a fact about the guidebook.
 * - the others are what a resource's `offline` option may still claim, until that option goes.
 *
 * A query with no entry may or may not have local rows; offline and empty, it says "not downloaded".
 */
export type OfflinePolicy = 'always' | 'excluded' | 'field' | 'personal'

/** Deliberately never kept. */
const EXCLUDED: readonly string[] = [
  'listComments',
  'listEvents',
  'listNotifications',
  'listRouteAscents',
] satisfies (keyof typeof queries)[]

/** The policy for a query, by the name Zero carries on every request: `excluded` or nothing. */
export function offlinePolicyOf(queryName: string | undefined): OfflinePolicy | undefined {
  return queryName != null && EXCLUDED.includes(queryName) ? 'excluded' : undefined
}
