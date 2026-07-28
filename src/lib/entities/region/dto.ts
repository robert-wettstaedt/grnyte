import type { AppRole, Permission } from '$lib/entities/rolePermission/dto'
import type { RegionSettings } from './mapLayers'

/** A region's own record, as shown on its settings screen. */
export interface RegionDetail {
  createdAt: Date | undefined
  /** Username of whoever created the region. */
  createdBy: string | undefined
  maxMembers: number
  name: string
}

/** A pending invitation, as listed on a region's settings screen. Deliberately without
 *  the join `token`, see `listRegionInvitations`. */
export interface RegionInvitationItem {
  email: string
  id: number
  invitedBy: string | undefined
  /** When the mail last went out, so the row can say "sent 5 minutes ago" and an admin can tell
   *  "give it a moment" from "resend it". */
  lastSentAt: Date | undefined
}

/** One row of a region's member list. */
export interface RegionMemberItem {
  id: number
  /** Username of whoever invited them, absent for the region's founder. */
  invitedBy: string | undefined
  role: AppRole
  userId: number
  username: string
}

/** An active region membership of the signed-in user, before permissions are resolved. */
export interface RegionMembership {
  name: string
  regionFk: number
  role: AppRole
  settings: RegionSettings | undefined
}

/**
 * How full a region is. `full` deliberately covers both "exactly at the limit" and
 * "over it": a region seeded before the limit existed reads the same as one that
 * just filled up, and there is nothing different for the user to do about either.
 */
export type SeatState = 'full' | 'ok' | 'oneLeft'

/** A live invitation addressed to the signed-in user, as listed on their settings screen. The
 *  other half of {@link RegionInvitationItem}: same row, seen from the invitee's side, and
 *  likewise without the join `token`. */
export interface UserInvitationItem {
  id: number
  /** Username of whoever sent it. Absent only if the inviter's row is gone. */
  invitedBy: string | undefined
  regionName: string
}

/** A region membership enriched with the permissions its role grants. */
export interface UserRegion extends RegionMembership {
  permissions: Permission[]
}

/**
 * The one accept link, relative.
 *
 * Lives here rather than in `invite.server.ts` because the accept page needs it on the client, and
 * that module imports the database. The invitation mail is the only caller that prefixes an
 * origin, since it is the only one that leaves the app.
 */
export function acceptPath(token: string): string {
  return `/invite/accept?token=${encodeURIComponent(token)}`
}
