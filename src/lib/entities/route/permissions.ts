import { checkRegionPermission, REGION_PERMISSION_DELETE, REGION_PERMISSION_EDIT } from '$lib/auth'
import type { UserRegion } from '$lib/entities/region/dto'

/** The route's (or its block's) region is what governs who may change it. */
type RoutePermissionTarget = { regionFk: number }

export function canAddRoute(userRegions: UserRegion[], block: RoutePermissionTarget): boolean {
  return checkRegionPermission(userRegions, [REGION_PERMISSION_EDIT], block.regionFk)
}

export function canDeleteRoute(userRegions: UserRegion[], route: RoutePermissionTarget): boolean {
  return checkRegionPermission(userRegions, [REGION_PERMISSION_DELETE], route.regionFk)
}

/**
 * Editing a route's own fields requires EDIT. The routes UPDATE policy additionally grants
 * READ, but only so a member logging an ascent can have their grade/rating opinion folded
 * into the route's community values (see recalcUserGradeAndRating) - not to edit route content.
 */
export function canEditRoute(userRegions: UserRegion[], route: RoutePermissionTarget): boolean {
  return checkRegionPermission(userRegions, [REGION_PERMISSION_EDIT], route.regionFk)
}
