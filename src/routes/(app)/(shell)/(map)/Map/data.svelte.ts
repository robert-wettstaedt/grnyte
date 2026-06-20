import type { BlockDetail } from '$lib/entities/block/dto'
import type { Geolocation } from '$lib/entities/geolocation/dto'
import { SvelteMap, SvelteSet } from 'svelte/reactivity'
import type { BlocksMapProps } from './types'

export const withPadding = (
  bounds: [number, number, number, number],
  blockCount: number,
): [number, number, number, number] => {
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

export function createMapData(props: BlocksMapProps) {
  const geoBlocks = $derived(props.blocks.filter((block) => block.geolocation != null))
  const routeCountByBlock = $derived(props.routeCountByBlock ?? new SvelteMap<number, number>())
  const gradeCountByBlock = $derived(props.gradeCountByBlock ?? new SvelteMap<number, Map<number, number>>())

  // Area tier — the outermost grouping, shown when zoomed out so the far view isn't
  // cluttered with every crag. Group each block under its first (outermost) area ancestor.
  const blocksByArea = $derived.by(() => {
    const grouped = new SvelteMap<number, { area: BlockDetail['areas'][0]; blocks: BlockDetail[] }>()

    for (const block of geoBlocks) {
      const area = block.areas.find((area) => area.type === 'area')
      if (area == null) continue

      const existing = grouped.get(area.id)
      if (existing == null) {
        grouped.set(area.id, { area, blocks: [block] })
      } else {
        existing.blocks.push(block)
      }
    }

    return grouped
  })

  // Crag tier — the block-holding area, shown at mid zoom (between the area rects and the
  // individual block markers).
  const blocksByCrag = $derived.by(() => {
    const grouped = new SvelteMap<number, { crag: BlockDetail['areas'][0]; blocks: BlockDetail[] }>()

    for (const block of geoBlocks) {
      const crag = block.areas.find((area) => area.type === 'crag')
      if (crag == null) continue

      const existing = grouped.get(crag.id)
      if (existing == null) {
        grouped.set(crag.id, { crag, blocks: [block] })
      } else {
        existing.blocks.push(block)
      }
    }

    return grouped
  })

  const routeCountByArea = $derived.by(() => {
    const counts = new SvelteMap<number, number>()
    const rcMap = routeCountByBlock

    for (const [areaId, group] of blocksByArea) {
      let total = 0
      for (const block of group.blocks) {
        total += rcMap.get(block.id) ?? 0
      }
      counts.set(areaId, total)
    }

    return counts
  })

  const routeCountByCrag = $derived.by(() => {
    const counts = new SvelteMap<number, number>()
    const rcMap = routeCountByBlock

    for (const [cragId, group] of blocksByCrag) {
      let total = 0
      for (const block of group.blocks) {
        total += rcMap.get(block.id) ?? 0
      }
      counts.set(cragId, total)
    }

    return counts
  })

  // Per-grade route counts, merged from each member block, for the donut markers.
  const mergeGradeCounts = (blocks: BlockDetail[]): SvelteMap<number, number> => {
    const merged = new SvelteMap<number, number>()
    for (const block of blocks) {
      const byGrade = gradeCountByBlock.get(block.id)
      if (byGrade == null) continue
      for (const [gradeFk, count] of byGrade) {
        merged.set(gradeFk, (merged.get(gradeFk) ?? 0) + count)
      }
    }
    return merged
  }

  const gradeCountByArea = $derived.by(() => {
    const counts = new SvelteMap<number, Map<number, number>>()
    for (const [areaId, group] of blocksByArea) {
      counts.set(areaId, mergeGradeCounts(group.blocks))
    }
    return counts
  })

  const gradeCountByCrag = $derived.by(() => {
    const counts = new SvelteMap<number, Map<number, number>>()
    for (const [cragId, group] of blocksByCrag) {
      counts.set(cragId, mergeGradeCounts(group.blocks))
    }
    return counts
  })

  const areaBoundingBoxes = $derived.by(() => {
    const boxes = new SvelteMap<number, { area: BlockDetail['areas'][0]; bounds: [number, number, number, number] }>()

    for (const [areaId, group] of blocksByArea) {
      const coords = group.blocks.map((block) => block.geolocation!).filter((location) => location != null)
      if (coords.length === 0) continue

      const lats = coords.map((location) => location.lat)
      const lngs = coords.map((location) => location.long)
      const bounds: [number, number, number, number] = [
        Math.min(...lats),
        Math.min(...lngs),
        Math.max(...lats),
        Math.max(...lngs),
      ]

      boxes.set(areaId, { area: group.area, bounds: withPadding(bounds, coords.length) })
    }

    return boxes
  })

  const cragBoundingBoxes = $derived.by(() => {
    const boxes = new SvelteMap<number, { crag: BlockDetail['areas'][0]; bounds: [number, number, number, number] }>()

    for (const [cragId, group] of blocksByCrag) {
      const coords = group.blocks.map((block) => block.geolocation!).filter((location) => location != null)
      if (coords.length === 0) continue

      const lats = coords.map((location) => location.lat)
      const lngs = coords.map((location) => location.long)
      const bounds: [number, number, number, number] = [
        Math.min(...lats),
        Math.min(...lngs),
        Math.max(...lats),
        Math.max(...lngs),
      ]

      boxes.set(cragId, { crag: group.crag, bounds: withPadding(bounds, coords.length) })
    }

    return boxes
  })

  const uniqueParkingLocations = $derived.by(() => {
    const deduplicated = new SvelteMap<number, Geolocation>()
    for (const parkingLocation of props.parkingLocations ?? []) {
      deduplicated.set(parkingLocation.id, parkingLocation)
    }
    return [...deduplicated.values()]
  })

  const uniqueLineStrings = $derived([...new SvelteSet(props.lineStrings ?? [])])

  return {
    get geoBlocks() {
      return geoBlocks
    },
    get blocksByArea() {
      return blocksByArea
    },
    get blocksByCrag() {
      return blocksByCrag
    },
    get routeCountByBlock() {
      return routeCountByBlock
    },
    get routeCountByArea() {
      return routeCountByArea
    },
    get routeCountByCrag() {
      return routeCountByCrag
    },
    get gradeCountByArea() {
      return gradeCountByArea
    },
    get gradeCountByCrag() {
      return gradeCountByCrag
    },
    get areaBoundingBoxes() {
      return areaBoundingBoxes
    },
    get cragBoundingBoxes() {
      return cragBoundingBoxes
    },
    get uniqueParkingLocations() {
      return uniqueParkingLocations
    },
    get uniqueLineStrings() {
      return uniqueLineStrings
    },
  }
}
