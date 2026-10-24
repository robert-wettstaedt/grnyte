import { checkRegionPermission, REGION_PERMISSION_DELETE } from '$lib/auth'
import type { UserRegion } from '$lib/entities/region/dto'

export function canModerate(userRegions: UserRegion[], regionFk: number): boolean {
  return checkRegionPermission(userRegions, [REGION_PERMISSION_DELETE], regionFk)
}

/** Not offered for your own ascent, media or comment. */
export function offersRemovalChoice(userRegions: UserRegion[], regionFk: number, ownLeaf = false): boolean {
  return !ownLeaf && canModerate(userRegions, regionFk)
}
