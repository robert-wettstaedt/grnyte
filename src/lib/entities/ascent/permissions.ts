import { checkRegionPermission, REGION_PERMISSION_ADMIN, REGION_PERMISSION_READ } from '$lib/auth'
import type { UserRegion } from '$lib/entities/region/dto'

/** The climber may edit or delete their own ascent; region admins may edit anyone's (mirrors RLS). */
export function canEditAscent(
  userRegions: UserRegion[],
  userId: number | undefined,
  ascent: { createdBy: number; regionFk: number },
): boolean {
  return (
    checkRegionPermission(userRegions, [REGION_PERMISSION_ADMIN], ascent.regionFk) ||
    (userId != null && userId === ascent.createdBy)
  )
}

/** Any region member may log their own ascents (RLS: READ can insert ascents). */
export function canLogAscent(userRegions: UserRegion[], route: { regionFk: number }): boolean {
  return checkRegionPermission(userRegions, [REGION_PERMISSION_READ], route.regionFk)
}
