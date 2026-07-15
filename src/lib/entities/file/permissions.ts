import {
  checkRegionPermission,
  REGION_PERMISSION_ADMIN,
  REGION_PERMISSION_DELETE,
  REGION_PERMISSION_EDIT,
  REGION_PERMISSION_READ,
} from '$lib/auth'
import type { UserRegion } from '$lib/entities/region/dto'
import type { MediaFile } from './dto'

/** Just the fields the permission checks read, so a server caller can gate without a full MediaFile. */
type FilePermissionInput = Pick<MediaFile, 'regionFk' | 'ascentCreatedBy'>

/** The own-ascent half of the files RLS: READ members may change media on their own ascents. */
const ownsAscentMedia = (userRegions: UserRegion[], userId: number | undefined, file: FilePermissionInput): boolean =>
  userId != null &&
  file.ascentCreatedBy === userId &&
  checkRegionPermission(userRegions, [REGION_PERMISSION_READ], file.regionFk)

/**
 * Whether the viewer may edit (incl. publish) a file. DELIBERATELY STRICTER than the files
 * UPDATE RLS, which we diverge from on purpose: publishing an ascent file exposes the whole
 * ascent, so a plain region EDITor (maintainer) must not touch someone else's ascent media.
 *
 * - Ascent file (`ascentCreatedBy` set): the ascent owner, or a region ADMIN. A read-only
 *   ascent owner still edits their own media (the own-ascent grant); a maintainer does not.
 * - Any other file: region EDIT — which every file/parent owner holds by default (you need
 *   edit to own the parent entity), so "owner or editor" collapses to just edit here.
 *
 * The RLS stays as a (looser) second line of defense; this is the effective gate on the
 * paths that run through it. Note the discriminator is `ascentCreatedBy`: callers must
 * populate it for ascent media, or the file falls through to the EDIT branch.
 */
export function canEditFile(userRegions: UserRegion[], userId: number | undefined, file: FilePermissionInput): boolean {
  if (file.ascentCreatedBy != null) {
    return (
      ownsAscentMedia(userRegions, userId, file) ||
      checkRegionPermission(userRegions, [REGION_PERMISSION_ADMIN], file.regionFk)
    )
  }
  return checkRegionPermission(userRegions, [REGION_PERMISSION_EDIT], file.regionFk)
}

/** Mirrors the files DELETE RLS (region DELETE, or READ on media of your own ascent). */
export function canDeleteFile(
  userRegions: UserRegion[],
  userId: number | undefined,
  file: FilePermissionInput,
): boolean {
  return (
    checkRegionPermission(userRegions, [REGION_PERMISSION_DELETE], file.regionFk) ||
    ownsAscentMedia(userRegions, userId, file)
  )
}
