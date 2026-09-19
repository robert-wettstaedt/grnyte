import { checkRegionPermission, REGION_PERMISSION_DELETE, REGION_PERMISSION_EDIT } from '$lib/auth'
import type { UserRegion } from '$lib/entities/region/dto'

/** The block's region is what governs who may change it. */
type BlockPermissionTarget = { regionFk: number }

/** Region DELETE, or an EDITor removing what they themselves created (mirrors v1). */
export function canDeleteBlock(
  userRegions: UserRegion[],
  userId: number | undefined,
  block: { createdBy?: null | number; regionFk: number },
): boolean {
  return (
    checkRegionPermission(userRegions, [REGION_PERMISSION_DELETE], block.regionFk) ||
    (userId != null &&
      block.createdBy === userId &&
      checkRegionPermission(userRegions, [REGION_PERMISSION_EDIT], block.regionFk))
  )
}

export function canEditBlock(userRegions: UserRegion[], block: BlockPermissionTarget): boolean {
  return checkRegionPermission(userRegions, [REGION_PERMISSION_EDIT], block.regionFk)
}
