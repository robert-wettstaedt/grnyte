import { toAreaListItem, type AreaAncestor } from '$lib/entities/area/mapper'
import type { Row } from '$lib/zero/types'
import type { Geolocation, ParkingDetail } from './dto'

export function toGeolocation(row: Row<'geolocations'>): Geolocation {
  return { id: row.id, lat: row.lat, long: row.long }
}

/** What `toParkingDetail` reads — a geolocation row with its `area` relation. */
interface ParkingDetailRow {
  readonly id: number
  readonly lat: number
  readonly long: number
  readonly regionFk: number
  readonly area?: AreaAncestor | undefined
}

export function toParkingDetail(row: ParkingDetailRow): ParkingDetail {
  return {
    id: row.id,
    lat: row.lat,
    long: row.long,
    regionFk: row.regionFk,
    area: row.area == null ? null : toAreaListItem(row.area),
  }
}
