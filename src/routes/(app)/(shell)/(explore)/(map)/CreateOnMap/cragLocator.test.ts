import { describe, expect, it } from 'vitest'
import { findNearestCrag, type LocatableBlock } from './cragLocator'

const crag = (id: number) => ({ areas: [], id, name: `Crag ${id}`, type: 'crag' as const })
const block = (cragId: number, lat: number, long: number): LocatableBlock => ({
  areas: [{ areas: [], id: 99, name: 'Region', type: 'area' }, crag(cragId)],
  geolocation: { estimated: false, id: 0, lat, long },
})

describe('findNearestCrag', () => {
  const point = { lat: 48.4103, long: 2.6117 }
  // ~0.001° latitude ≈ 111 m
  const blocks = [block(1, 48.4113, 2.6117), block(2, 48.4143, 2.6117)]

  it('picks the crag with the closest block', () => {
    const match = findNearestCrag(blocks, point)
    expect(match?.cragId).toBe(1)
    expect(match?.distanceMeters).toBeGreaterThan(100)
    expect(match?.distanceMeters).toBeLessThan(125)
  })

  it('returns null when nothing is within the threshold', () => {
    expect(findNearestCrag(blocks, { lat: 49, long: 3 })).toBeNull()
  })

  it('skips blocks without geolocation or crag ancestor', () => {
    const bare: LocatableBlock[] = [
      { areas: [crag(3)], geolocation: undefined },
      { areas: [], geolocation: { estimated: false, id: 0, lat: point.lat, long: point.long } },
    ]
    expect(findNearestCrag(bare, point)).toBeNull()
  })
})
