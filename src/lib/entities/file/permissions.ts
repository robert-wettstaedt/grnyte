import {
  checkRegionPermission,
  REGION_PERMISSION_DELETE,
  REGION_PERMISSION_EDIT,
  REGION_PERMISSION_READ,
} from '$lib/auth'
import type { UserRegion } from '$lib/entities/region/dto'
import type { MediaFile } from './dto'

/** The own-ascent half of the files RLS: READ members may change media on their own ascents. */
const ownsAscentMedia = (userRegions: UserRegion[], userId: number | undefined, file: MediaFile): boolean =>
  userId != null &&
  file.ascentCreatedBy === userId &&
  checkRegionPermission(userRegions, [REGION_PERMISSION_READ], file.regionFk)

/** Mirrors the files UPDATE RLS (region EDIT, or READ on media of your own ascent). */
export function canEditFile(userRegions: UserRegion[], userId: number | undefined, file: MediaFile): boolean {
  return (
    checkRegionPermission(userRegions, [REGION_PERMISSION_EDIT], file.regionFk) ||
    ownsAscentMedia(userRegions, userId, file)
  )
}

/** Mirrors the files DELETE RLS (region DELETE, or READ on media of your own ascent). */
export function canDeleteFile(userRegions: UserRegion[], userId: number | undefined, file: MediaFile): boolean {
  return (
    checkRegionPermission(userRegions, [REGION_PERMISSION_DELETE], file.regionFk) ||
    ownsAscentMedia(userRegions, userId, file)
  )
}
