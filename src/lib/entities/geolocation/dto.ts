import type { AreaListItem } from '$lib/entities/area/dto'

export type Geolocation = {
  id: number
  lat: number
  long: number
}

export type ParkingDetail = {
  id: number
  lat: number
  long: number
  regionFk: number
  /** The area this parking belongs to (with its ancestor trail), for context. */
  area: AreaListItem | null
}
