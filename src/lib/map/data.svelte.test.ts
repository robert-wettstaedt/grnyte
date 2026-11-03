import type { BlockDetail } from '$lib/entities/block/dto'
import { flushSync } from 'svelte'
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
    areaIds: data.areaTier.map(({ area }) => area.id),
    sectorIds: data.sectorTier.map(({ area }) => area.id),
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

/** A tier as the layers draw it: one entry per rect, in insertion order. */
const tierView = (data: ReturnType<typeof createMapData>, tier: 'area' | 'sector') =>
  (tier === 'area' ? data.areaTier : data.sectorTier).map(({ area, bounds, gradeCounts, routeCount }) => ({
    bounds,
    gradeCounts: [...gradeCounts],
    id: area.id,
    name: area.name,
    routeCount,
  }))

describe('createMapData tier contents', () => {
  const at = (b: BlockDetail, lat: number, long: number) =>
    ({ ...b, geolocation: { ...b.geolocation, lat, long } }) as BlockDetail
  const OTHER_SECTOR = { id: 21, name: 'Slab', type: 'sector' } as const
  const blocks = [
    at(block(1, [AREA, SECTOR]), 49.3, 12.1),
    at(block(2, [AREA, SECTOR]), 49.31, 12.12),
    at(block(3, [AREA, OTHER_SECTOR]), 49.35, 12.2),
    at(block(4, [ROOT_SECTOR]), 50, 13),
    { ...block(5, [AREA, SECTOR]), geolocation: null } as unknown as BlockDetail,
  ]
  const data = createMapData({
    blocks,
    gradeCountByBlock: new Map([
      [1, new Map([[5, 2]])],
      [
        2,
        new Map([
          [5, 1],
          [7, 4],
        ]),
      ],
      [4, new Map([[3, 1]])],
      [5, new Map([[9, 9]])],
    ]),
    routeCountByBlock: new Map([
      [1, 2],
      [2, 5],
      [3, 1],
      [5, 9],
    ]),
  })

  it('sums, merges and frames the area tier', () => {
    expect(tierView(data, 'area')).toMatchInlineSnapshot(`
      [
        {
          "bounds": [
            49.296,
            12.092,
            49.354,
            12.207999999999998,
          ],
          "gradeCounts": [
            [
              5,
              3,
            ],
            [
              7,
              4,
            ],
          ],
          "id": 10,
          "name": "Forest",
          "routeCount": 8,
        },
        {
          "bounds": [
            49.9995,
            12.9995,
            50.0005,
            13.0005,
          ],
          "gradeCounts": [
            [
              3,
              1,
            ],
          ],
          "id": 30,
          "name": "Root 2",
          "routeCount": 0,
        },
      ]
    `)
  })

  it('sums, merges and frames the sector tier', () => {
    expect(tierView(data, 'sector')).toMatchInlineSnapshot(`
      [
        {
          "bounds": [
            49.2992,
            12.0984,
            49.3108,
            12.121599999999999,
          ],
          "gradeCounts": [
            [
              5,
              3,
            ],
            [
              7,
              4,
            ],
          ],
          "id": 20,
          "name": "Wall",
          "routeCount": 7,
        },
        {
          "bounds": [
            49.3495,
            12.199499999999999,
            49.350500000000004,
            12.2005,
          ],
          "gradeCounts": [],
          "id": 21,
          "name": "Slab",
          "routeCount": 1,
        },
        {
          "bounds": [
            49.9995,
            12.9995,
            50.0005,
            13.0005,
          ],
          "gradeCounts": [
            [
              3,
              1,
            ],
          ],
          "id": 30,
          "name": "Root 2",
          "routeCount": 0,
        },
      ]
    `)
  })
})

describe('createMapData thinning a crowded region', () => {
  type Node = { id: number; parentFk?: number; type: 'area' | 'sector' }
  /** One block per sector and one sector per area: today's far view draws those areas. */
  const region = (roots: number[], areasPerRoot: number, wrapper?: number) => {
    const nodes: Node[] = wrapper == null ? [] : [{ id: wrapper, type: 'area' }]
    const blocks: BlockDetail[] = []
    for (const root of roots) {
      nodes.push({ id: root, parentFk: wrapper, type: 'area' })
      for (let i = 0; i < areasPerRoot; i++) {
        const area = root * 100 + i
        nodes.push({ id: area, parentFk: root, type: 'area' }, { id: area * 10, parentFk: area, type: 'sector' })
        const parent = { id: area, name: `A${area}`, type: 'area' } as const
        blocks.push(block(area, [parent, { id: area * 10, name: `S${area}`, type: 'sector' }]))
      }
    }
    const areas = nodes.map((node) => ({ ...node, areas: [], name: `N${node.id}` }))
    const data = createMapData({ areas: areas as never, blocks })
    const ids = (tier: { area: { id: number } }[]) => tier.map(({ area }) => area.id)
    return {
      far: ids(data.areaTier).length,
      late: ids(data.lateSectorTier).length,
      middle: ids(data.middleTier).length,
      sectors: ids(data.sectorTier).length,
      top: ids(data.areaTier).slice(0, 3),
    }
  }

  it("draws a crowded region by its top level, today's areas in the middle, its sectors late", () => {
    expect(region([1, 2], 16)).toEqual({ far: 2, late: 32, middle: 32, sectors: 0, top: [1, 2] })
  })

  it('steps inside a lone wrapper to reach the top level', () => {
    expect(region([1, 2, 3], 11, 9)).toEqual({ far: 3, late: 33, middle: 33, sectors: 0, top: [1, 2, 3] })
  })

  it('leaves a deeper region under the limit as it is: regions 4 and 34 draw 18 and 15 today', () => {
    expect(region([1, 2], 10)).toEqual({ far: 20, late: 0, middle: 0, sectors: 20, top: [100, 101, 102] })
  })

  it('leaves a region at or under the limit as it is: region 32 today is a wrapper over 14 areas', () => {
    expect(region([1], 14, 9)).toEqual({ far: 14, late: 0, middle: 0, sectors: 14, top: [100, 101, 102] })
  })

  it("leaves a crowded region whose top level is today's areas as it is", () => {
    expect(region([1], 31)).toEqual({ far: 31, late: 0, middle: 0, sectors: 31, top: [100, 101, 102] })
  })

  it('leaves a region of exactly CROWDED_TIER areas as it is', () => {
    expect(region([1, 2], 15)).toEqual({ far: 30, late: 0, middle: 0, sectors: 30, top: [100, 101, 102] })
  })

  it('keeps every tier when an area sync changes nothing the tiers draw', () => {
    const areas: Node[] = [1, 2].map((id) => ({ id, type: 'area' }))
    const blocks: BlockDetail[] = []
    for (let id = 100; id < 132; id++) {
      areas.push({ id, parentFk: id < 116 ? 1 : 2, type: 'area' }, { id: id * 10, parentFk: id, type: 'sector' })
      blocks.push(
        block(id, [
          { id, name: `A${id}`, type: 'area' },
          { id: id * 10, name: `S${id}`, type: 'sector' },
        ]),
      )
    }
    const props = $state({ areas: areas.map((area) => ({ ...area, areas: [], name: `N${area.id}` })), blocks })
    let runs = 0
    const stop = $effect.root(() => {
      const data = createMapData(props as never)
      $effect(() => {
        void [data.areaTier, data.middleTier, data.sectorTier, data.lateSectorTier]
        runs++
      })
    })
    flushSync()
    props.areas = props.areas.map((area) => ({ ...area }))
    flushSync()
    expect(runs).toBe(1)
    props.areas = props.areas.map((area) => (area.id === 1 ? { ...area, name: 'Renamed' } : area))
    flushSync()
    stop()
    expect(runs).toBe(2)
  })
})
