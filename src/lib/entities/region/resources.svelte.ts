import { compareNames } from '$lib/i18n/collator'
import { queries } from '$lib/zero/queries'
import { createResource } from '$lib/zero/resource.svelte'
import { toRegionDetail, toRegionMemberItem, toRegionMembership } from './mapper'

/** A single region's own record, for its settings screen. */
export function regionDetail(id: () => number) {
  return createResource(
    () => queries.region({ id: id() }),
    (row) => (row == null ? undefined : toRegionDetail(row)),
  )
}

/**
 * Active members of a region, with the username of whoever invited each of them.
 * Sorted here rather than in the query: Zero cannot order by a related table's column,
 * and without a sort a role change re-syncs the row to a different position.
 */
export function regionMemberList(regionFk: () => number) {
  return createResource(
    () => queries.listRegionMembers({ regionFk: regionFk() }),
    (rows) => rows.map(toRegionMemberItem).sort((a, b) => compareNames(a.username, b.username)),
  )
}

/**
 * The signed-in user's active region memberships, each with its region's name
 * and settings. Preloaded in `initZero`; the global state layers on the
 * permissions granted by each membership's role. Sorted by name so the settings list
 * and the region picker keep a stable order.
 */
export function userRegionList() {
  return createResource(
    () => queries.listUserRegions(),
    (rows) => rows.map(toRegionMembership).sort((a, b) => compareNames(a.name, b.name)),
  )
}
