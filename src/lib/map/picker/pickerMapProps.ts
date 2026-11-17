import type { MapData } from '../types'

/** The props a location picker hands `<Map>`: the explore dataset without its area donuts. Getters, so a spread prop
 *  tracks only its own field. */
export function pickerMapProps(data: MapData): Omit<MapData, 'areas'> {
  return {
    get blocks() {
      return data.blocks
    },
    // Zero always knows its counts; PowerSync's may still be arriving.
    get countsUnknown() {
      return data.countsUnknown ?? false
    },
    get gradeCountByBlock() {
      return data.gradeCountByBlock
    },
    get lineStrings() {
      return data.lineStrings
    },
    get parkingLocations() {
      return data.parkingLocations
    },
    get routeCountByBlock() {
      return data.routeCountByBlock
    },
  }
}
