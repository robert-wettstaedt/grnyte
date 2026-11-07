import type { Row } from '$lib/zero/types'
import type { Geolocation } from './dto'

export function toGeolocation(row: Row<'geolocations'>): Geolocation {
  return { estimated: row.estimated ?? false, id: row.id, lat: row.lat, long: row.long }
}
