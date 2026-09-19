import { checkRegionPermission, REGION_PERMISSION_EDIT } from '$lib/auth'
import type { UserRegion } from '$lib/entities/region/dto'

/** Gates entry to the topo editor and every in-editor line/photo edit: region EDIT. */
export function canEditTopo(userRegions: UserRegion[], target: { regionFk: number }): boolean {
  return checkRegionPermission(userRegions, [REGION_PERMISSION_EDIT], target.regionFk)
}
