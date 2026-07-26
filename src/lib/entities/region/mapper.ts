import { queries } from '$lib/zero/queries'
import type { QueryRow } from '$lib/zero/types'
import type { RegionDetail, RegionMemberItem, RegionMembership, SeatState } from './dto'

export type RegionDetailRow = NonNullable<QueryRow<typeof queries.region>>
export type RegionMemberListRow = QueryRow<typeof queries.listRegionMembers>
export type RegionMemberRow = QueryRow<typeof queries.listUserRegions>

/** A region name for a search breadcrumb, shown only when the signed-in user spans
 *  more than one region (with a single region it's implied and would just be noise). */
export function regionCrumb(userRegions: RegionMembership[], regionFk: null | number | undefined): string | undefined {
  if (userRegions.length <= 1 || regionFk == null) {
    return undefined
  }
  return userRegions.find((region) => region.regionFk === regionFk)?.name
}

/**
 * How full a region is, given how many seats are taken and how many it has.
 * `used` counts active members plus pending invitations, so inviting one more person
 * cannot overshoot the limit.
 */
export function seatState(used: number, max: number): SeatState {
  if (used >= max) return 'full'
  if (used === max - 1) return 'oneLeft'
  return 'ok'
}

export function toRegionDetail(row: RegionDetailRow): RegionDetail {
  return {
    createdAt: row.createdAt == null ? undefined : new Date(row.createdAt),
    createdBy: row.author?.username,
    maxMembers: row.maxMembers ?? 0,
    name: row.name,
  }
}

export function toRegionMemberItem(row: RegionMemberListRow): RegionMemberItem {
  return {
    id: row.id,
    invitedBy: row.invitedBy?.username,
    role: row.role,
    userId: row.userFk,
    username: row.user?.username ?? '',
  }
}

export function toRegionMembership(row: RegionMemberRow): RegionMembership {
  return {
    name: row.region?.name ?? '',
    regionFk: row.regionFk,
    role: row.role,
    settings: row.region?.settings ?? undefined,
  }
}
