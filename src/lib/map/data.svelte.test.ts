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
