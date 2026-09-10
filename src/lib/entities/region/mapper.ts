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
 * A region's name for reading, which is never the empty string.
 *
 * Memberships and regions are separate tables joined on the client, so a membership routinely
 * arrives before the region it names and `name` is '' until it does. That is not a region without
 * a name, it is a name that has not turned up yet, and the two read differently. Here rather than
 * at each call site, for the reason AGENTS.md gives: a breadcrumb, a select option and a settings
 * row must not disagree about what a region is called.
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
  // Not read at all when the region row is absent: everything it could return would be discarded
  // for `unknownRegionSettings()` below, once per membership per re-derive and per request.
  const stored = row.region == null ? undefined : readRegionSettings(row.region.settings)

  return {
    // Both false while the region row is missing, whatever the (absent) blob would read as. The
    // `*Complete` flags are documented as the gate for writing a key back, so a screen that checked
    // only those would seed from an empty blob and save it. Only map-layers' extra `synced` test
    // stood between that and the region's data.
    layersComplete: stored?.layersComplete === true,
    name: row.region?.name ?? '',
    regionFk: row.regionFk,
    role: row.role,
    // Checked rather than cast: the column is untyped jsonb, so a blob that does not match would
    // otherwise surface as a crash inside the map. Every client reader of `settings` (the map's
    // overlays, the tag vocabulary, the settings screens) comes through here. The server reads the
    // same column off `locals.userRegions` and parses it the same way, see `getUserPermissions`.
    // Separate questions, because conflating any two of them has now cost data. Whether the region
    // row is here at all is `synced`. Whether a key can be written back is that key's `*Complete`.
    // `settings` is what can be READ either way, which is why a blob that only half parsed must
    // never read as an empty one: the map-layers form seeded zero rows from exactly that and Save
    // wrote it back, deleting every layer the region had.
    // Guarded like the flags above, and for the consumers they do not reach: a membership whose
    // region has not synced read as the seven DEFAULT tags, and the route pickers
    // (`RouteFormFields`, `TopoAddRouteModal`) take the value, not the flag. A reader was offered
    // tags the region may not use, ticked one, and the server allowlist dropped it in silence.
    settings: stored?.settings ?? unknownRegionSettings(),
    synced: row.region != null,
    tagsComplete: stored?.tagsComplete === true,
  }
}
