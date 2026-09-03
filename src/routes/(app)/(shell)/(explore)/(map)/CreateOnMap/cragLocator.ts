import type { AreaListItem } from '$lib/entities/area/dto'
import type { Geolocation } from '$lib/entities/geolocation/dto'
import { haversineMetres, type Coords } from '$lib/map/map'

export interface LocatableBlock {
  /** Ancestor chain, outermost first: the crag is the entry with `type === 'crag'`. */
  areas: AreaListItem[]
  geolocation: Geolocation | undefined
}

/**
 * The crag whose nearest geolocated block is closest to `point`, or null when none is
 * within `maxMeters`. Callers pre-filter `blocks` to the regions the user can edit.
 * ponytail: nearest-block distance stands in for point-in-crag-bounds. At boulder
 * spacing a 500 m radius covers containment; bbox hit-testing is the upgrade.
 */
export function findNearestCrag(
  blocks: LocatableBlock[],
  point: Coords,
  maxMeters = 500,
): null | { cragId: number; distanceMeters: number } {
  let best: null | { cragId: number; distanceMeters: number } = null

  for (const block of blocks) {
    if (block.geolocation == null) continue
    const crag = block.areas.find((area) => area.type === 'crag')
    if (crag == null) continue

    const distanceMeters = haversineMetres(block.geolocation, point)
    if (distanceMeters <= maxMeters && (best == null || distanceMeters < best.distanceMeters)) {
      best = { cragId: crag.id, distanceMeters }
    }
  }

  return best
}
