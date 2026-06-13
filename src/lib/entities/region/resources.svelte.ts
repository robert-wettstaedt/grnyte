import { queries } from '$lib/zero/queries'
import { createResource } from '$lib/zero/resource.svelte'
import { toRegionMembership } from './mapper'

/**
 * The signed-in user's active region memberships, each with its region's name
 * and settings. Preloaded in `initZero`; the global state layers on the
 * permissions granted by each membership's role.
 */
export function userRegionList() {
  return createResource(
    () => queries.listUserRegions(),
    (rows) => rows.map(toRegionMembership),
  )
}
