/* eslint-disable svelte/prefer-svelte-reactivity -- these collections are rebuilt wholesale
   inside $derived (the new reference is the reactivity) and never mutated afterwards.
   Plain Map avoids per-key signal overhead; see exploreData.svelte.ts for the dev-mode cost. */
import type { BlockDetail } from '$lib/entities/block/dto'
import type { Geolocation } from '$lib/entities/geolocation/dto'
import type { Coords } from './map'
import type { BlocksMapProps, Bounds } from './types'

const boundsOfCoords = (coords: Coords[]): Bounds | null => {
  if (coords.length === 0) return null
  const lats = coords.map((location) => location.lat)
  const lngs = coords.map((location) => location.long)
  return [Math.min(...lats), Math.min(...lngs), Math.max(...lats), Math.max(...lngs)]
}

/** The box around the blocks that carry a pin, null when none does. */
export const blockBounds = (blocks: { geolocation: Coords | null | undefined }[]): Bounds | null =>
  boundsOfCoords(blocks.map((block) => block.geolocation).filter((location) => location != null))

const withPadding = (bounds: Bounds, blockCount: number): Bounds => {
  let [minLat, minLng, maxLat, maxLng] = bounds
  const latSpan = maxLat - minLat
  const lngSpan = maxLng - minLng

  if (blockCount <= 1 || latSpan < 0.0005 || lngSpan < 0.0005) {
    return [minLat - 0.0005, minLng - 0.0005, maxLat + 0.0005, maxLng + 0.0005]
  }

  const latPad = latSpan * 0.08
  const lngPad = lngSpan * 0.08
  minLat -= latPad
  minLng -= lngPad
  maxLat += latPad
  maxLng += lngPad

  return [minLat, minLng, maxLat, maxLng]
}

/** One rect of an area or sector tier, with what its donut marker shows. */
export interface TierEntry {
  area: BlockDetail['areas'][0]
  bounds: Bounds
  gradeCounts: Map<number, number>
  routeCount: number
}

export function createMapData(props: BlocksMapProps) {
  const geoBlocks = $derived(props.blocks.filter((block) => block.geolocation != null))
  const routeCountByBlock = $derived(props.routeCountByBlock ?? new Map<number, number>())
  const gradeCountByBlock = $derived(props.gradeCountByBlock ?? new Map<number, Map<number, number>>())

  // Per-grade route counts, merged from each member block, for the donut markers.
  const mergeGradeCounts = (blocks: BlockDetail[]): Map<number, number> => {
    const merged = new Map<number, number>()
    for (const block of blocks) {
      for (const [gradeFk, count] of gradeCountByBlock.get(block.id) ?? []) {
        merged.set(gradeFk, (merged.get(gradeFk) ?? 0) + count)
      }
    }
    return merged
  }

  /** One rect per ancestor `pick` chooses, framing that ancestor's located blocks. */
  const tierOf = (pick: (block: BlockDetail) => BlockDetail['areas'][0] | undefined): TierEntry[] => {
    const grouped = new Map<number, { area: BlockDetail['areas'][0]; blocks: BlockDetail[] }>()
    for (const block of geoBlocks) {
      const area = pick(block)
      if (area == null) continue
      const group = grouped.get(area.id)
      if (group == null) grouped.set(area.id, { area, blocks: [block] })
      else group.blocks.push(block)
    }

    return [...grouped.values()].flatMap(({ area, blocks }) => {
      const coords = blocks.map((block) => block.geolocation).filter((location) => location != null)
      const bounds = boundsOfCoords(coords)
      if (bounds == null) return []
      const routeCount = blocks.reduce((sum, block) => sum + (routeCountByBlock.get(block.id) ?? 0), 0)
      return [{ area, bounds: withPadding(bounds, coords.length), gradeCounts: mergeGradeCounts(blocks), routeCount }]
    })
  }

  // Area tier, drawn zoomed out: each block under its outermost area. Falls back to the outermost
  // ancestor whatever its type, or a sector at a region's root would be in no group below
  // SECTOR_ZOOM and its blocks would vanish; it then draws the same rect at both zooms, never together.
  const areaTier = $derived(tierOf((block) => block.areas.find((area) => area.type === 'area') ?? block.areas[0]))
  // Sector tier, drawn at mid zoom: the block-holding area.
  const sectorTier = $derived(tierOf((block) => block.areas.find((area) => area.type === 'sector')))

  const uniqueParkingLocations = $derived.by(() => {
    const deduplicated = new Map<number, Geolocation>()
    for (const parkingLocation of props.parkingLocations ?? []) {
      deduplicated.set(parkingLocation.id, parkingLocation)
    }
    return [...deduplicated.values()]
  })

  const uniqueLineStrings = $derived([...new Set(props.lineStrings ?? [])])

  return {
    get areaTier() {
      return areaTier
    },
    get geoBlocks() {
      return geoBlocks
    },
    get routeCountByBlock() {
      return routeCountByBlock
    },
    get sectorTier() {
      return sectorTier
    },
    get uniqueLineStrings() {
      return uniqueLineStrings
    },
    get uniqueParkingLocations() {
      return uniqueParkingLocations
    },
  }
}
