import { queries } from '$lib/zero/queries'
import type { QueryRow } from '$lib/zero/types'
import type { RegionMembership } from './dto'

export type RegionMemberRow = QueryRow<typeof queries.listUserRegions>

export function toRegionMembership(row: RegionMemberRow): RegionMembership {
  return {
    regionFk: row.regionFk,
    role: row.role,
    name: row.region?.name ?? '',
    settings: row.region?.settings ?? undefined,
  }
}
