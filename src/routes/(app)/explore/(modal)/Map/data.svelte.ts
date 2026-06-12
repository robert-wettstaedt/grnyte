import type { BlockDetail } from '$lib/entities/block/dto'
import type { Geolocation } from '$lib/entities/geolocation/dto'
import type { BlocksMapProps } from './types'

export const findArea = (
  area: BlockDetail['areas'][0] | null | undefined,
  type?: string,
): BlockDetail['areas'][0][] => {
  const parents: BlockDetail['areas'][0][] = []
  let current = area
  while (current != null) {
    parents.unshift(current)
    if (type != null && current.type === type && current.areas.at(-1)?.type !== type) break
    current = current.areas.at(-1) as BlockDetail['areas'][0] | null
  }
  return parents
}

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
  const routeCountByBlock = $derived(props.routeCountByBlock ?? new Map<number, number>())

  const blocksBySector = $derived.by(() => {
    const grouped = new Map<number, { sector: BlockDetail['areas'][0]; blocks: BlockDetail[] }>()

    for (const block of geoBlocks) {
      const sector = findArea(block.areas[0], 'sector').find((item) => item.type === 'sector')
      if (sector == null) continue

      const existing = grouped.get(sector.id)
      if (existing == null) {
        grouped.set(sector.id, { sector, blocks: [block] })
      } else {
        existing.blocks.push(block)
      }
    }

    return grouped
  })

  const blocksByCrag = $derived.by(() => {
    const grouped = new Map<number, { crag: BlockDetail['areas'][0]; blocks: BlockDetail[] }>()

    for (const block of geoBlocks) {
      const crag = findArea(block.areas.at(-1), 'crag').find((item) => item.type === 'crag')
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

  const routeCountBySector = $derived.by(() => {
    const counts = new Map<number, number>()
    const rcMap = routeCountByBlock

    for (const [sectorId, group] of blocksBySector) {
      let total = 0
      for (const block of group.blocks) {
        total += rcMap.get(block.id) ?? 0
      }
      counts.set(sectorId, total)
    }

    return counts
  })

  const routeCountByCrag = $derived.by(() => {
    const counts = new Map<number, number>()
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

  const sectorBoundingBoxes = $derived.by(() => {
    const boxes = new Map<number, { sector: BlockDetail['areas'][0]; bounds: [number, number, number, number] }>()

    for (const [sectorId, group] of blocksBySector) {
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

      boxes.set(sectorId, { sector: group.sector, bounds: withPadding(bounds, coords.length) })
    }

    return boxes
  })

  const cragBoundingBoxes = $derived.by(() => {
    const boxes = new Map<number, { crag: BlockDetail['areas'][0]; bounds: [number, number, number, number] }>()

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
    const deduplicated = new Map<number, Geolocation>()
    for (const parkingLocation of props.parkingLocations ?? []) {
      deduplicated.set(parkingLocation.id, parkingLocation)
    }
    return [...deduplicated.values()]
  })

  const uniqueLineStrings = $derived([...new Set(props.lineStrings ?? [])])

  return {
    get geoBlocks() {
      return geoBlocks
    },
    get blocksBySector() {
      return blocksBySector
    },
    get blocksByCrag() {
      return blocksByCrag
    },
    get routeCountByBlock() {
      return routeCountByBlock
    },
    get routeCountBySector() {
      return routeCountBySector
    },
    get routeCountByCrag() {
      return routeCountByCrag
    },
    get sectorBoundingBoxes() {
      return sectorBoundingBoxes
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
