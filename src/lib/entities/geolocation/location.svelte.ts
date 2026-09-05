import { userLocation } from '$lib/map/geolocation.svelte'
import { formatMetres, haversineMetres, type Coords } from '$lib/map/map'

export type LocationState = {
  readonly distance: string | undefined
  readonly isHere: boolean
}

/** Live distance to an entity, for the location meta line. Call during component init. */
export function createLocationState(destination: () => Coords | undefined): LocationState {
  // Gated so a page with nowhere to go never prompts for location permission.
  const location = userLocation(() => destination() != null)

  const metres = $derived.by(() => {
    const here = location.current
    const there = destination()
    return here == null || there == null ? undefined : haversineMetres(here, there)
  })

  return {
    get distance() {
      return metres == null ? undefined : formatMetres(metres)
    },
    // ponytail: 50 m "you're here" radius; tune for GPS accuracy / crag size.
    get isHere() {
      return metres != null && metres < 50
    },
  }
}
