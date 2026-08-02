import type { BlockDetail } from '$lib/entities/block/dto'
import { describe, expect, it } from 'vitest'
import { createMapData } from './data.svelte'

/**
 * The map draws three tiers at three zoom ranges: outer-area rects when zoomed out, crag rects in
 * the middle, block markers up close. A block that lands in no tier is invisible at that zoom,
 * which is what this is here to catch.
 */
const block = (id: number, areas: { id: number; name: string; type: 'area' | 'crag' }[]): BlockDetail =>
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
const CRAG = { id: 20, name: 'Wall', type: 'crag' } as const
const ROOT_CRAG = { id: 30, name: 'Root 2', type: 'crag' } as const

const tiers = (blocks: BlockDetail[]) => {
  const data = createMapData({ blocks })
  return {
    areaIds: [...data.blocksByArea.keys()],
    cragIds: [...data.blocksByCrag.keys()],
  }
}

describe('createMapData tiers', () => {
  it('groups a nested block under its outermost area and its crag', () => {
    expect(tiers([block(1, [AREA, CRAG])])).toEqual({ areaIds: [AREA.id], cragIds: [CRAG.id] })
  })

  it('puts a root crag in the area tier too, so its blocks do not vanish when zoomed out', () => {
    expect(tiers([block(2, [ROOT_CRAG])])).toEqual({ areaIds: [ROOT_CRAG.id], cragIds: [ROOT_CRAG.id] })
  })

  it('leaves a block with no area chain in no tier', () => {
    expect(tiers([block(3, [])])).toEqual({ areaIds: [], cragIds: [] })
  })
})
