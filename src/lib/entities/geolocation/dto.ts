import type { AreaListItem } from '$lib/entities/area/dto'

export type Geolocation = {
  estimated: boolean
  id: number
  lat: number
  long: number
}

export type ParkingDetail = {
  /** The area this parking belongs to (with its ancestor trail), for context. */
  area: AreaListItem | null
  /** The stored area, which a delete leaves for; read off the row, never the `area` relation. */
  areaFk: number | undefined
  id: number
  lat: number
  long: number
  regionFk: number
}
