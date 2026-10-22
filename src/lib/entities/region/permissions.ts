import { checkRegionPermission, REGION_PERMISSION_ADMIN, REGION_PERMISSION_READ } from '$lib/auth'
import type { UserRegion } from './dto'

/**
 * Whether the signed-in user may administer a region: rename it, change member roles,
 * remove members and invite people.
 *
 * Named `canEdit*` for consistency with `canEditArea` / `canEditAscent`, but note it
 * checks `region.admin` rather than `region.edit`: a region's own settings are an
 * administrative concern, not a content edit, so a maintainer must not reach them.
 *
 * Membership is the only thing that grants this, deliberately: `app.admin` is not a
 * superuser here. It carries no region permission, `authorize_in_region` never consults
 * it, and Zero scopes every sync on `region_members`, so no app admin syncs a region's
 * content. The one in-app exception is the region stats page, which serves an app admin
 * aggregate counts through the privileged handle: counts only, never content.
 */
export function canEditRegion(userRegions: UserRegion[], regionFk: number): boolean {
  return checkRegionPermission(userRegions, [REGION_PERMISSION_ADMIN], regionFk)
}

/**
 * Whether the signed-in user is a reading member of a region.
 *
 * The row form of {@link checkRegionPermission}, for the handlers that are handed one `regionFk`
 * and have to decide about it. Separate from {@link canEditRegion} because a region has reads that
 * every member is entitled to even where only admins may act:
 * `listRegionInvitations` is the example, since a pending invitation holds a seat and the seat
 * counter is shown to everyone.
 */
export function canReadRegion(userRegions: UserRegion[], regionFk: number): boolean {
  return checkRegionPermission(userRegions, [REGION_PERMISSION_READ], regionFk)
}
