import { checkRegionPermission, REGION_PERMISSION_DELETE, REGION_PERMISSION_EDIT } from '$lib/auth'
import type { UserRegion } from '$lib/entities/region/dto'

/** The route's (or its block's) region is what governs who may change it. */
type RoutePermissionTarget = { regionFk: number }

export function canAddRoute(userRegions: UserRegion[], block: RoutePermissionTarget): boolean {
  return checkRegionPermission(userRegions, [REGION_PERMISSION_EDIT], block.regionFk)
}

/** Any region member may edit a route, the community fills the gaps (RLS: READ can update routes). */
export function canEditRoute(userRegions: UserRegion[], route: RoutePermissionTarget): boolean {
  return checkRegionPermission(userRegions, [REGION_PERMISSION_EDIT], route.regionFk)
}

export function canDeleteRoute(userRegions: UserRegion[], route: RoutePermissionTarget): boolean {
  return checkRegionPermission(userRegions, [REGION_PERMISSION_DELETE], route.regionFk)
}
