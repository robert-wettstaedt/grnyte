import type { Geolocation } from '$lib/entities/geolocation/dto'
import type { MapCameraClaim, MapFocus } from '$lib/map/types'

/** The entities with a detail route under `(map)`, and so with a camera claim. */
export type MapEntity = 'areas' | 'blocks' | 'parking'

/** Enough of a block to frame it and to know its areas. */
export interface TargetBlock {
  areas: { id: number }[]
  geolocation?: null | { lat: number; long: number }
  id: number
}

export interface TargetInput {
  blocks: TargetBlock[]
  /** The id in the route, already parsed. */
  id: number
  padding: [number, number, number, number]
  parkingLocations: Geolocation[]
  routeId: string
  /** Folded into the claim key, so pressing Show again is a fresh claim. */
  showOnMapRequest: number
}

/**
 * What the open route wants of the camera. One triage, so the claim and the framing cannot disagree
 * about which entity is open. The claim is returned even with nothing to frame yet, because the row
 * can arrive seconds later.
 */
export function cameraTarget(input: TargetInput): null | { claim: MapCameraClaim; focus: MapFocus | null } {
  const entity = entityOf(input.routeId)
  if (entity == null || !Number.isFinite(input.id)) return null
  const claim: MapCameraClaim = { key: `${entity}/${input.id}#${input.showOnMapRequest}`, kind: 'entity' }
  return { claim, focus: framing(entity, input) }
}

/** Exhaustive on purpose. A new detail route returns null until it is added here, so it claims
 *  nothing instead of claiming under a real area's key. */
export function entityOf(routeId: string): MapEntity | null {
  if (routeId.includes('parking/')) return 'parking'
  if (routeId.includes('blocks/')) return 'blocks'
  if (routeId.includes('areas/')) return 'areas'
  return null
}

function framing(entity: MapEntity, { blocks, id, padding, parkingLocations }: TargetInput): MapFocus | null {
  if (entity === 'parking') {
    const parking = parkingLocations.find((location) => location.id === id)
    return parking == null ? null : { center: [parking.lat, parking.long], padding, zoom: 16 }
  }

  if (entity === 'blocks') {
    const block = blocks.find((candidate) => candidate.id === id)
    return block?.geolocation == null
      ? null
      : { center: [block.geolocation.lat, block.geolocation.long], padding, zoom: 16 }
  }

  // An area is framed by the blocks under it, anywhere in its subtree.
  const geoBlocks = blocks.filter((block) => block.geolocation != null && block.areas.some((area) => area.id === id))
  if (geoBlocks.length === 0) return null
  const lats = geoBlocks.map((block) => block.geolocation!.lat)
  const lngs = geoBlocks.map((block) => block.geolocation!.long)
  return { extent: [Math.min(...lats), Math.min(...lngs), Math.max(...lats), Math.max(...lngs)], padding }
}
