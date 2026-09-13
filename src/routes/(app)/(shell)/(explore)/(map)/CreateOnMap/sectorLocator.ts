import type { AreaListItem } from '$lib/entities/area/dto'
import type { Geolocation } from '$lib/entities/geolocation/dto'
import { haversineMetres, type Coords } from '$lib/map/map'

export interface LocatableBlock {
  /** Ancestor chain, outermost first: the sector is the entry with `type === 'sector'`. */
  areas: AreaListItem[]
  geolocation: Geolocation | undefined
}

/** Each ancestor's distance to its nearest sector, for ranking areas holding no blocks of their own.
 *  Absent, not `Infinity`, when nothing beneath is located. Reaches two levels up (`listAreas`). */
export function ancestorDistances(
  sectorMetres: Map<number, number>,
  areas: { areas: { id: number }[]; id: number }[],
): Map<number, number> {
  const byAncestor = new Map<number, number>()

  for (const area of areas) {
    const metres = sectorMetres.get(area.id)
    if (metres == null) continue

    for (const ancestor of area.areas) {
      const best = byAncestor.get(ancestor.id)
      if (best == null || metres < best) {
        byAncestor.set(ancestor.id, metres)
      }
    }
  }

  return byAncestor
}

/**
 * The sector whose nearest geolocated block is closest to `point`, or null when none is
 * within `maxMeters`. Callers pre-filter `blocks` to the regions the user can edit.
 * ponytail: nearest-block distance stands in for point-in-sector-bounds. At boulder
 * spacing a 500 m radius covers containment; bbox hit-testing is the upgrade.
 */
export function findNearestSector(
  blocks: LocatableBlock[],
  point: Coords,
  maxMeters = 500,
): null | { distanceMeters: number; sectorId: number } {
  let best: null | { distanceMeters: number; sectorId: number } = null

  for (const block of blocks) {
    if (block.geolocation == null) continue
    const sector = block.areas.find((area) => area.type === 'sector')
    if (sector == null) continue

    const distanceMeters = haversineMetres(block.geolocation, point)
    if (distanceMeters <= maxMeters && (best == null || distanceMeters < best.distanceMeters)) {
      best = { distanceMeters, sectorId: sector.id }
    }
  }

  return best
}

/**
 * Metres from `point` to each sector's nearest geolocated block, the same proxy `findNearestSector`
 * uses. A sector with no geolocated block is absent, not `Infinity`: unknown is not "far".
 */
export function sectorDistances(blocks: LocatableBlock[], point: Coords): Map<number, number> {
  const bySector = new Map<number, number>()

  for (const block of blocks) {
    if (block.geolocation == null) continue
    const sector = block.areas.find((area) => area.type === 'sector')
    if (sector == null) continue

    const distanceMeters = haversineMetres(block.geolocation, point)
    const best = bySector.get(sector.id)
    if (best == null || distanceMeters < best) {
      bySector.set(sector.id, distanceMeters)
    }
  }

  return bySector
}
