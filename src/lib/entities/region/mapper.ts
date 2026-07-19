import { queries } from '$lib/zero/queries'
import type { QueryRow } from '$lib/zero/types'
import type { RegionMembership } from './dto'

export type RegionMemberRow = QueryRow<typeof queries.listUserRegions>

/** A region name for a search breadcrumb, shown only when the signed-in user spans
 *  more than one region (with a single region it's implied and would just be noise). */
export function regionCrumb(userRegions: RegionMembership[], regionFk: null | number | undefined): string | undefined {
  if (userRegions.length <= 1 || regionFk == null) {
    return undefined
  }
  return userRegions.find((region) => region.regionFk === regionFk)?.name
}

export function toRegionMembership(row: RegionMemberRow): RegionMembership {
  return {
    name: row.region?.name ?? '',
    regionFk: row.regionFk,
    role: row.role,
    settings: row.region?.settings ?? undefined,
  }
}
