import type { BlockDetail } from '$lib/entities/block/dto'
import { describe, expect, it } from 'vitest'
import { createMapData } from './data.svelte'

/**
 * The map draws three tiers at three zoom ranges: outer-area rects when zoomed out, sector rects in
 * the middle, block markers up close. A block that lands in no tier is invisible at that zoom,
 * which is what this is here to catch.
 */
const block = (id: number, areas: { id: number; name: string; type: 'area' | 'sector' }[]): BlockDetail =>
  ({
    areas: areas.map((area) => ({ ...area, areas: [] })),
    geolocation: { estimated: false, lat: 49.3, long: 12.1 },
    id,
    name: `Block ${id}`,
    order: 0,
    rawName: `Block ${id}`,
    regionFk: 1,
    topoImages: [],
  }) as unknown as BlockDetail

const AREA = { id: 10, name: 'Forest', type: 'area' } as const
const SECTOR = { id: 20, name: 'Wall', type: 'sector' } as const
const ROOT_SECTOR = { id: 30, name: 'Root 2', type: 'sector' } as const

const tiers = (blocks: BlockDetail[]) => {
  const data = createMapData({ blocks })
  return {
    areaIds: [...data.blocksByArea.keys()],
    sectorIds: [...data.blocksBySector.keys()],
  }
}

describe('createMapData tiers', () => {
  it('groups a nested block under its outermost area and its sector', () => {
    expect(tiers([block(1, [AREA, SECTOR])])).toEqual({ areaIds: [AREA.id], sectorIds: [SECTOR.id] })
  })

  it('puts a root sector in the area tier too, so its blocks do not vanish when zoomed out', () => {
    expect(tiers([block(2, [ROOT_SECTOR])])).toEqual({ areaIds: [ROOT_SECTOR.id], sectorIds: [ROOT_SECTOR.id] })
  })

  it('leaves a block with no area chain in no tier', () => {
    expect(tiers([block(3, [])])).toEqual({ areaIds: [], sectorIds: [] })
  })
})
