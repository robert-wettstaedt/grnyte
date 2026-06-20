import { describe, expect, it } from 'vitest'
import { haversineMetres, pickDistanceUnit } from './map'

describe('haversineMetres', () => {
  it('is zero for the same point', () => {
    expect(haversineMetres({ lat: 52.5, long: 13.4 }, { lat: 52.5, long: 13.4 })).toBe(0)
  })

  it('measures ~111 km per degree of latitude', () => {
    expect(haversineMetres({ lat: 0, long: 0 }, { lat: 1, long: 0 })).toBeCloseTo(111_195, -2)
  })

  it('matches a known city pair (London → Paris ≈ 343 km)', () => {
    const d = haversineMetres({ lat: 51.5074, long: -0.1278 }, { lat: 48.8566, long: 2.3522 })
    expect(d / 1000).toBeCloseTo(344, -1)
  })
})

describe('pickDistanceUnit', () => {
  it('switches metres → km at 1 km', () => {
    expect(pickDistanceUnit(300, false)).toEqual({ value: 300, unit: 'meter' })
    expect(pickDistanceUnit(1000, false)).toEqual({ value: 1, unit: 'kilometer' })
  })

  it('switches feet → miles at 1 mile', () => {
    expect(pickDistanceUnit(304.8, true)).toEqual({ value: 1000, unit: 'foot' }) // 1000 ft
    expect(pickDistanceUnit(1609.344, true)).toEqual({ value: 1, unit: 'mile' })
  })
})
