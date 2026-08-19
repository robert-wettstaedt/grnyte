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
 * it, and Zero scopes every sync on `region_members` - so an app admin with no membership
 * cannot even load the screen. The `app.admin` policies on `regions` and `region_members`
 * stay, which makes app admins a database-level back office rather than an in-app one.
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

/**
 * Whether taking the admin role away from `userFk` - by demotion, removal or their own
 * departure - would leave the region with nobody able to administer it. Only an admin can
 * promote anyone, and no in-app path exists to rescue such a region (see {@link canEditRegion}
 * on why app admins are not one), so it would have to be fixed in the database.
 *
 * `adminUserFks` is every *active* admin of the region. Somebody who is not among them can
 * always go, which is what makes this safe to ask about any member.
 */
export function isLastAdmin(adminUserFks: number[], userFk: number): boolean {
  return adminUserFks.length <= 1 && adminUserFks.includes(userFk)
}
