import { page } from '$app/state'
import { getGlobalState } from '$lib/state/global.svelte'
import { canEditRegion } from './permissions'

/**
 * A region settings screen's id, admin gate and membership, as getters because one route serves
 * every region. The gate only catches a typed URL; the server refuses the write anyway.
 */
export function regionAdminScreen() {
  const global = getGlobalState()
  const regionId = $derived(Number(page.params.regionId))
  const isAdmin = $derived(canEditRegion(global.userRegions, regionId))
  const membership = $derived(global.userRegions.find((region) => region.regionFk === regionId))
  return {
    get isAdmin() {
      return isAdmin
    },
    get membership() {
      return membership
    },
    get regionId() {
      return regionId
    },
  }
}
