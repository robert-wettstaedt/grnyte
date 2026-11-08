import { toAreaListItem, type AreaAncestor } from '$lib/entities/area/mapper'
import { areaChain } from '$lib/entities/area/resources.svelte'
import { collections } from '$lib/powersync/collections'
import { psResource } from '$lib/powersync/resource.svelte'
import { toZeroRow, unwrapParents } from '$lib/powersync/rows'
import { holdWhileDeleting } from '$lib/zero/deleting.svelte'
import { eq } from '@tanstack/db'
import type { ParkingDetail } from './dto'

/** What `toParkingDetail` reads: a geolocation row with its `area` relation. Kept out of
 *  `mapper.ts` because `area/mapper` imports that file. */
interface ParkingDetailRow {
  readonly area?: AreaAncestor | undefined
  readonly areaFk: null | number
  readonly id: number
  readonly lat: number
  readonly long: number
  readonly regionFk: number
}

export function parkingDetail(id: () => number) {
  const parking = psResource(
    (q) =>
      q
        .from({ g: collections().geolocations })
        .where(({ g }) => eq(g.nid, id()))
        .select(({ g }) => ({ ...g, area: areaChain(q, g.area_fk, 2) })),
    [id],
    // A parking is a geolocation on a live area: a block's (no area) or a deleted area's has none here.
    ([row]) => (row == null || row.area.length === 0 ? undefined : toSyncedParking(row)),
  )
  return holdWhileDeleting(parking, 'parking', id)
}

/** A synced geolocation with its area chain through the parking mapper. */
export const toSyncedParking = (row: { area: object[] }) =>
  toParkingDetail({
    ...toZeroRow<ParkingDetailRow>('geolocations', row),
    area: unwrapParents(row.area[0] as Parameters<typeof unwrapParents>[0]) as AreaAncestor | undefined,
  })

function toParkingDetail(row: ParkingDetailRow): ParkingDetail {
  return {
    area: row.area == null ? null : toAreaListItem(row.area),
    areaFk: row.areaFk ?? undefined,
    id: row.id,
    lat: row.lat,
    long: row.long,
    regionFk: row.regionFk,
  }
}
