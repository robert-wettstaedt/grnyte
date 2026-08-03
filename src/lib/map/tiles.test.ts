import { describe, expect, it } from 'vitest'
import { fitZoom, pointPx, TILE_SIZE, tileView, worldPx } from './tiles'

const BOX = { height: 135, width: 240 }

describe('worldPx', () => {
  it('puts null island at the centre of the single zoom-0 tile', () => {
    expect(worldPx({ lat: 0, long: 0 }, 0)).toEqual({ x: 128, y: 128 })
  })

  it('agrees with the slippy-map tile numbering (Berlin at z12 is 2200/1343)', () => {
    const { x, y } = worldPx({ lat: 52.52, long: 13.405 }, 12)
    expect([Math.floor(x / TILE_SIZE), Math.floor(y / TILE_SIZE)]).toEqual([2200, 1343])
  })
})

describe('fitZoom', () => {
  it('does not zoom a lone pin to the max, where OSM has no context left', () => {
    expect(fitZoom([{ lat: 47.1, long: 8.5 }], BOX.width, BOX.height)).toBe(16)
  })

  it('picks the tightest zoom that still fits both pins', () => {
    const points = [
      { lat: 47.1, long: 8.5 },
      { lat: 47.1004, long: 8.5006 }, // ~65 m apart
    ]
    const zoom = fitZoom(points, BOX.width, BOX.height)
    const spanAt = (z: number) => {
      const [a, b] = points.map((point) => worldPx(point, z))
      return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))
    }

    expect(spanAt(zoom)).toBeLessThanOrEqual(BOX.height)
    // One zoom tighter would overflow the box, or we left resolution on the table.
    expect(spanAt(zoom + 1)).toBeGreaterThan(BOX.height - 56)
  })

  it('keeps a nudge of a few metres visibly apart rather than stacking the pins', () => {
    const points = [
      { lat: 47.1, long: 8.5 },
      { lat: 47.100027, long: 8.5 }, // ~3 m
    ]
    const [a, b] = points.map((point) => worldPx(point, fitZoom(points, BOX.width, BOX.height)))
    expect(Math.abs(a.y - b.y)).toBeGreaterThan(10)
  })
})

describe('tileView', () => {
  it('covers every pixel of the viewport', () => {
    const { tiles } = tileView([{ lat: 47.1, long: 8.5 }], BOX.width, BOX.height)

    for (const [x, y] of [
      [0, 0],
      [BOX.width - 1, 0],
      [0, BOX.height - 1],
      [BOX.width - 1, BOX.height - 1],
      [BOX.width / 2, BOX.height / 2],
    ]) {
      const covering = tiles.filter(
        (tile) => x >= tile.left && x < tile.left + TILE_SIZE && y >= tile.top && y < tile.top + TILE_SIZE,
      )
      expect(covering).toHaveLength(1)
    }
  })

  it('centres a lone pin', () => {
    const point = { lat: 47.1, long: 8.5 }
    const { left, top } = pointPx(point, tileView([point], BOX.width, BOX.height))

    expect(left).toBeCloseTo(BOX.width / 2)
    expect(top).toBeCloseTo(BOX.height / 2)
  })

  it('wraps columns across the antimeridian instead of asking for a tile that does not exist', () => {
    const { tiles, zoom } = tileView([{ lat: 0, long: 179.9999 }], BOX.width, BOX.height)

    expect(tiles.length).toBeGreaterThan(0)
    for (const tile of tiles) {
      expect(tile.x).toBeGreaterThanOrEqual(0)
      expect(tile.x).toBeLessThan(2 ** zoom)
    }
  })
})
