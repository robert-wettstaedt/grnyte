import type { AppRole, Permission } from '$lib/entities/rolePermission/dto'
import type { RegionSettings } from '$lib/forms/schemas'

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

/** A region membership enriched with the permissions its role grants. */
export interface UserRegion extends RegionMembership {
  permissions: Permission[]
}
