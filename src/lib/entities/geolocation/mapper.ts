import type { Row } from '$lib/zero/types'
import type { Geolocation } from './dto'

export function toGeolocation(row: Row<'geolocations'>): Geolocation {
  return { id: row.id, lat: row.lat, long: row.long }
}
