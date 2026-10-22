import { page } from '$app/state'
import { m } from '$lib/paraglide/messages'
import { getGlobalState } from '$lib/state/global.svelte'
import { entityHref } from '../href'
import type { RegionDetail } from './dto'
import { canEditRegion } from './permissions'

/** `Form`'s `denied` on a region settings screen, leading back to the region. */
export const regionDenied = (regionId: number, description: string) => ({
  description,
  primaryAction: { href: entityHref('regions', regionId), label: m.region_viewRegion() },
  title: m.form_noPermissionTitle(),
  type: 'generic' as const,
})

export function ownerOnlyDenied(region: RegionDetail | undefined, userId: number | undefined) {
  if (region == null || region.owner.id === userId) return undefined
  return regionDenied(region.id, m.region_ownerOnly())
}

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
