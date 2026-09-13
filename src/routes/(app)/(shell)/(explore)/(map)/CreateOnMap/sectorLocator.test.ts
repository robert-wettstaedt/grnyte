import { toDisplayName } from '$lib/entities/displayName'
import { describe, expect, it } from 'vitest'
import { findNearestSector, sectorDistances, type LocatableBlock } from './sectorLocator'

const sector = (id: number) => ({ areas: [], id, name: toDisplayName(`Sector ${id}`), type: 'sector' as const })
const block = (sectorId: number, lat: number, long: number): LocatableBlock => ({
  areas: [{ areas: [], id: 99, name: toDisplayName('Region'), type: 'area' }, sector(sectorId)],
  geolocation: { estimated: false, id: 0, lat, long },
})

describe('findNearestSector', () => {
  const point = { lat: 48.4103, long: 2.6117 }
  // ~0.001° latitude ≈ 111 m
  const blocks = [block(1, 48.4113, 2.6117), block(2, 48.4143, 2.6117)]

  it('picks the sector with the closest block', () => {
    const match = findNearestSector(blocks, point)
    expect(match?.sectorId).toBe(1)
    expect(match?.distanceMeters).toBeGreaterThan(100)
    expect(match?.distanceMeters).toBeLessThan(125)
  })

  it('returns null when nothing is within the threshold', () => {
    expect(findNearestSector(blocks, { lat: 49, long: 3 })).toBeNull()
  })

  it('skips blocks without geolocation or sector ancestor', () => {
    const bare: LocatableBlock[] = [
      { areas: [sector(3)], geolocation: undefined },
      { areas: [], geolocation: { estimated: false, id: 0, lat: point.lat, long: point.long } },
    ]
    expect(findNearestSector(bare, point)).toBeNull()
  })
})

describe('sectorDistances', () => {
  const point = { lat: 48.4103, long: 2.6117 }

  it('keeps each sector its nearest block, not its last or its average', () => {
    const distances = sectorDistances([block(1, 48.4143, 2.6117), block(1, 48.4113, 2.6117)], point)
    expect(distances.get(1)).toBeGreaterThan(100)
    expect(distances.get(1)).toBeLessThan(125)
  })

  it('ranks every sector, with no threshold to fall outside of', () => {
    const distances = sectorDistances([block(1, 48.4113, 2.6117), block(2, 49, 3)], point)
    expect([...distances.keys()].toSorted((a, b) => distances.get(a)! - distances.get(b)!)).toEqual([1, 2])
  })

  it('omits a sector with no geolocated block rather than ranking it last', () => {
    const distances = sectorDistances([{ areas: [sector(3)], geolocation: undefined }], point)
    expect(distances.has(3)).toBe(false)
  })
})
