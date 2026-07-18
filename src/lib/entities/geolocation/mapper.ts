import { toAreaListItem, type AreaAncestor } from '$lib/entities/area/mapper'
import type { Row } from '$lib/zero/types'
import type { Geolocation, ParkingDetail } from './dto'

/** What `toParkingDetail` reads — a geolocation row with its `area` relation. */
interface ParkingDetailRow {
  readonly area?: AreaAncestor | undefined
  readonly id: number
  readonly lat: number
  readonly long: number
  readonly regionFk: number
}

export function toGeolocation(row: Row<'geolocations'>): Geolocation {
  return { estimated: row.estimated ?? false, id: row.id, lat: row.lat, long: row.long }
}

export function toParkingDetail(row: ParkingDetailRow): ParkingDetail {
  return {
    area: row.area == null ? null : toAreaListItem(row.area),
    id: row.id,
    lat: row.lat,
    long: row.long,
    regionFk: row.regionFk,
  }
}
