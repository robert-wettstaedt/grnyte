/* eslint-disable svelte/prefer-svelte-reactivity -- these collections are rebuilt wholesale
   inside $derived (the new reference is the reactivity) and never mutated afterwards.
   Plain Map avoids per-key signal overhead; see exploreData.svelte.ts for the dev-mode cost. */
import type { AreaListItem } from '$lib/entities/area/dto'
import type { BlockDetail } from '$lib/entities/block/dto'
import type { Geolocation } from '$lib/entities/geolocation/dto'
import type { Coords } from './map'
import { CROWDED_TIER, type BlocksMapProps, type Bounds } from './types'

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

  // The area above the block's sector (a block loads one parent, not the root), else its outermost
  // ancestor, or a sector at a region's root would draw in no tier below SECTOR_ZOOM.
  const outer = (block: BlockDetail) => block.areas.find((area) => area.type === 'area') ?? block.areas[0]
  const sectorOf = (block: BlockDetail) => block.areas.find((area) => area.type === 'sector')

  const areaById = $derived(new Map((props.areas ?? []).map((area) => [area.id, area])))
  const chainOf = (block: BlockDetail): AreaListItem[] => {
    const chain: AreaListItem[] = []
    const seen = new Set<number>()
    let current = areaById.get(block.areas.at(-1)?.id ?? -1)
    while (current != null && !seen.has(current.id)) {
      seen.add(current.id)
      if (current.type !== 'sector') chain.unshift(current)
      current = current.parentFk == null ? undefined : areaById.get(current.parentFk)
    }
    return chain
  }

  // areaMapList maps fresh rows on every sync: keep the last picks while ids and names hold, or
  // an unrelated area edit rebuilds every tier layer.
  let lastThinned = new Map<number, AreaListItem>()
  const samePicks = (a: Map<number, AreaListItem>, b: Map<number, AreaListItem>) =>
    a.size === b.size && [...a].every(([id, area]) => b.get(id)?.id === area.id && b.get(id)?.name === area.name)

  // Per crowded region, each block's area at the first level of the tree holding more than one.
  const thinned = $derived.by(() => {
    const byRegion = new Map<number, BlockDetail[]>()
    for (const block of geoBlocks) {
      const blocks = byRegion.get(block.regionFk)
      if (blocks == null) byRegion.set(block.regionFk, [block])
      else blocks.push(block)
    }
    const top = new Map<number, AreaListItem>()
    for (const blocks of byRegion.values()) {
      const today = new Set(blocks.map((block) => outer(block)?.id)).size
      if (today <= CROWDED_TIER) continue
      const chains = blocks.map(chainOf)
      const at = (chain: AreaListItem[], depth: number) => chain[Math.min(depth, chain.length - 1)]
      let depth = 0
      while (
        new Set(chains.map((chain) => at(chain, depth)?.id)).size <= 1 &&
        chains.some((chain) => chain.length > depth + 1)
      ) {
        depth++
      }
      const picks = blocks.map((block, i) => [block.id, at(chains[i], depth) ?? outer(block)] as const)
      if (new Set(picks.map(([, area]) => area?.id)).size >= today) continue
      for (const [id, area] of picks) if (area != null) top.set(id, area)
    }
    if (!samePicks(top, lastThinned)) lastThinned = top
    return lastThinned
  })

  // A crowded region draws its top level zoomed out, and its usual areas in the middle tier.
  const areaTier = $derived(tierOf((block) => thinned.get(block.id) ?? outer(block)))
  const middleTier = $derived(tierOf((block) => (thinned.has(block.id) ? outer(block) : undefined)))
  const sectorTier = $derived(tierOf((block) => (thinned.has(block.id) ? undefined : sectorOf(block))))
  const lateSectorTier = $derived(tierOf((block) => (thinned.has(block.id) ? sectorOf(block) : undefined)))

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
    get lateSectorTier() {
      return lateSectorTier
    },
    get middleTier() {
      return middleTier
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
