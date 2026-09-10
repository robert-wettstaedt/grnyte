import { alreadyDisplayable, toDisplayName, type DisplayName } from '$lib/entities/displayName'
import { m } from '$lib/paraglide/messages'
import { queries } from '$lib/zero/queries'
import type { QueryRow } from '$lib/zero/types'
import type { RegionDetail, RegionMemberItem, RegionMembership, SeatState } from './dto'
import { readRegionSettings, unknownRegionSettings } from './settings'

export type RegionDetailRow = NonNullable<QueryRow<typeof queries.region>>
export type RegionMemberListRow = QueryRow<typeof queries.listRegionMembers>
export type RegionMemberRow = QueryRow<typeof queries.listUserRegions>

/** A region name for a search breadcrumb, shown only when the signed-in user spans
 *  more than one region (with a single region it's implied and would only be noise). */
export function regionCrumb(
  userRegions: RegionMembership[],
  regionFk: null | number | undefined,
): DisplayName | undefined {
  if (userRegions.length <= 1 || regionFk == null) {
    return undefined
  }
  const region = userRegions.find((entry) => entry.regionFk === regionFk)
  return region == null ? undefined : regionDisplayName(region)
}

/**
 * A region's name for reading, never the empty string. A membership routinely arrives before the
 * region it names, and "not turned up yet" reads differently from "has no name".
 */
export function regionDisplayName(region: Pick<RegionMembership, 'name' | 'synced'>): DisplayName {
  if (!region.synced) {
    return alreadyDisplayable(m.common_syncing())
  }
  return toDisplayName(region.name)
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
  // Not read when the region row is absent: it would be discarded for `unknownRegionSettings()`.
  const stored = row.region == null ? undefined : readRegionSettings(row.region.settings)

  return {
    // Both false while the region row is missing: a screen checking only the flags would seed
    // from an empty blob and save that.
    layersComplete: stored?.layersComplete === true,
    name: row.region?.name ?? '',
    regionFk: row.regionFk,
    role: row.role,
    // Checked rather than cast: the column is untyped jsonb, so a blob that does not match would
    // otherwise surface as a crash inside the map. Every client reader of `settings` (the map's
    // overlays, the tag vocabulary, the settings screens) comes through here. The server reads the
    // same column off `locals.userRegions` and parses it the same way, see `getUserPermissions`.
    // Three separate questions: `synced` is whether the row is here, `*Complete` is whether a key
    // may be written back, `settings` is what can be READ either way.
    // Guarded for the consumers the flags do not reach: the route pickers take the value, so an
    // unsynced region offered the defaults and the server allowlist dropped the pick in silence.
    settings: stored?.settings ?? unknownRegionSettings(),
    synced: row.region != null,
    tagsComplete: stored?.tagsComplete === true,
  }
}
