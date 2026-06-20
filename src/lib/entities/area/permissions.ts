import { checkRegionPermission, REGION_PERMISSION_DELETE, REGION_PERMISSION_EDIT } from '$lib/auth'
import type { UserRegion } from '$lib/entities/region/dto'
import type { AreaDetail } from './dto'

/** The fields these checks read — satisfied by an {@link AreaDetail} or any
 *  lighter row carrying the area's region and type. */
type AreaPermissionTarget = Pick<AreaDetail, 'regionFk' | 'type'>

/**
 * Whether the user may add a sub-area beneath `area`. Sub-areas may only live under an
 * Area (folder); a Crag holds blocks rather than sub-areas, so adding is never allowed
 * there. Otherwise it needs `region.edit` on the area's region.
 */
export function canAddArea(userRegions: UserRegion[], area: AreaPermissionTarget): boolean {
  return (
    (area.type == null || area.type === 'area') &&
    checkRegionPermission(userRegions, [REGION_PERMISSION_EDIT], area.regionFk)
  )
}

/**
 * Whether the user may add a block beneath `area`. Blocks may only live under a Crag (the
 * climbing spot); never under an Area (folder). Otherwise it needs `region.edit`.
 */
export function canAddBlock(userRegions: UserRegion[], area: AreaPermissionTarget): boolean {
  return (
    (area.type == null || area.type === 'crag') &&
    checkRegionPermission(userRegions, [REGION_PERMISSION_EDIT], area.regionFk)
  )
}

/** Whether the user may edit `area`. Needs `region.edit` on the area's region. */
export function canEditArea(userRegions: UserRegion[], area: AreaPermissionTarget): boolean {
  return checkRegionPermission(userRegions, [REGION_PERMISSION_EDIT], area.regionFk)
}

/** Whether the user may delete `area`. Needs `region.delete` on the area's region. */
export function canDeleteArea(userRegions: UserRegion[], area: AreaPermissionTarget): boolean {
  return checkRegionPermission(userRegions, [REGION_PERMISSION_DELETE], area.regionFk)
}
