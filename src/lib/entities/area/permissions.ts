import { canDeleteCreatedRow, checkRegionPermission, REGION_PERMISSION_DELETE, REGION_PERMISSION_EDIT } from '$lib/auth'
import type { UserRegion } from '$lib/entities/region/dto'
import type { AreaDetail } from './dto'

type AreaPermissionTarget = Pick<AreaDetail, 'regionFk' | 'type'>

type ParkingPermissionTarget = Pick<AreaDetail, 'regionFk'>

export function canAddArea(userRegions: UserRegion[], area: AreaPermissionTarget): boolean {
  return (
    (area.type == null || area.type === 'area') &&
    checkRegionPermission(userRegions, [REGION_PERMISSION_EDIT], area.regionFk)
  )
}

export function canAddBlock(userRegions: UserRegion[], area: AreaPermissionTarget): boolean {
  return (
    (area.type == null || area.type === 'sector') &&
    checkRegionPermission(userRegions, [REGION_PERMISSION_EDIT], area.regionFk)
  )
}

export function canAddParking(userRegions: UserRegion[], area: AreaPermissionTarget): boolean {
  return area.type === 'sector' && checkRegionPermission(userRegions, [REGION_PERMISSION_EDIT], area.regionFk)
}

export const canDeleteArea = canDeleteCreatedRow

export function canDeleteParking(userRegions: UserRegion[], area: ParkingPermissionTarget): boolean {
  return checkRegionPermission(userRegions, [REGION_PERMISSION_DELETE], area.regionFk)
}

export function canEditArea(userRegions: UserRegion[], area: AreaPermissionTarget): boolean {
  return checkRegionPermission(userRegions, [REGION_PERMISSION_EDIT], area.regionFk)
}
