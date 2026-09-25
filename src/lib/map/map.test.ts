import { describe, expect, it } from 'vitest'
import { formatCoord, haversineMetres, isMapPanKey, pickDistanceUnit, sectorReferencePoint } from './map'

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

describe('sectorReferencePoint', () => {
  const parking = { lat: 50.1, long: 11.1 }
  const pins = [{ lat: 50, long: 10 }, undefined, { lat: 52, long: 14 }]

  it('is the parking when there is one, whatever the blocks say', () => {
    expect(sectorReferencePoint(parking, pins)).toEqual(parking)
  })

  it('is the mean of the block pins otherwise, ignoring blocks with no pin', () => {
    expect(sectorReferencePoint(null, pins)).toEqual({ lat: 51, long: 12 })
    expect(sectorReferencePoint(undefined, pins)).toEqual({ lat: 51, long: 12 })
  })

  it('is null when nothing locates the sector', () => {
    expect(sectorReferencePoint(null, [])).toBeNull()
    expect(sectorReferencePoint(null, [undefined])).toBeNull()
  })

  it('drops the extra fields a parking row carries, keeping only the coords', () => {
    const parkingRow = { estimated: true, id: 7, lat: 50.1, long: 11.1 }
    expect(sectorReferencePoint(parkingRow, [])).toEqual(parking)
  })
})

describe('pickDistanceUnit', () => {
  it('switches metres → km at 1 km', () => {
    expect(pickDistanceUnit(300, false)).toEqual({ unit: 'meter', value: 300 })
    expect(pickDistanceUnit(1000, false)).toEqual({ unit: 'kilometer', value: 1 })
  })

  it('switches feet → miles at 1 mile', () => {
    expect(pickDistanceUnit(304.8, true)).toEqual({ unit: 'foot', value: 1000 }) // 1000 ft
    expect(pickDistanceUnit(1609.344, true)).toEqual({ unit: 'mile', value: 1 })
  })
})

describe('formatCoord', () => {
  it('reads out five decimals with the hemisphere, as the design specifies', () => {
    expect(formatCoord([49.0042, 13.1025])).toBe('49.00420°N, 13.10250°E')
  })

  // The sign picks the letter, and the number is printed without it: a southern latitude read as
  // "-49.00420°S" would be wrong twice over.
  it('drops the sign it has already spent on the hemisphere', () => {
    expect(formatCoord([-49.0042, -13.1025])).toBe('49.00420°S, 13.10250°W')
  })

  it('puts the equator and the prime meridian in the positive hemispheres', () => {
    expect(formatCoord([0, 0])).toBe('0.00000°N, 0.00000°E')
  })
})

describe('isMapPanKey', () => {
  const key = (key: string, modifiers: Partial<KeyboardEvent> = {}) =>
    ({ altKey: false, ctrlKey: false, key, metaKey: false, shiftKey: false, ...modifiers }) as KeyboardEvent

  it('counts a plain arrow', () => {
    expect(isMapPanKey(key('ArrowLeft'))).toBe(true)
  })

  it('ignores a modified arrow, because OpenLayers will not pan on one', () => {
    expect(isMapPanKey(key('ArrowLeft', { metaKey: true }))).toBe(false)
    expect(isMapPanKey(key('ArrowLeft', { shiftKey: true }))).toBe(false)
    expect(isMapPanKey(key('ArrowLeft', { altKey: true }))).toBe(false)
  })

  it('ignores the zoom keys unless asked for them', () => {
    expect(isMapPanKey(key('+'))).toBe(false)
    expect(isMapPanKey(key('+'), true)).toBe(true)
    expect(isMapPanKey(key('-'), true)).toBe(true)
  })

  // '+' is Shift+'=' on a US or UK layout, and KeyboardZoom allows Shift. Rejecting it lets the
  // reader zoom without the surface noticing.
  it('counts a shifted zoom key, which is how + is typed', () => {
    expect(isMapPanKey(key('+', { shiftKey: true }), true)).toBe(true)
  })

  it('ignores a platform-modified zoom key, which is a browser zoom', () => {
    expect(isMapPanKey(key('+', { metaKey: true }), true)).toBe(false)
    expect(isMapPanKey(key('-', { ctrlKey: true }), true)).toBe(false)
  })
})
