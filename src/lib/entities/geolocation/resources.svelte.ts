import { toAreaListItem, type AreaAncestor } from '$lib/entities/area/mapper'
import { holdWhileDeleting } from '$lib/zero/deleting.svelte'
import { queries } from '$lib/zero/queries'
import { createResource } from '$lib/zero/resource.svelte'
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
  const parking = createResource(
    () => queries.parking({ id: id() }),
    (row) => (row == null ? undefined : toParkingDetail(row)),
  )
  return holdWhileDeleting(parking, 'parking', id)
}

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
