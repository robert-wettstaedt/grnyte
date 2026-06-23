import { describe, expect, it } from 'vitest'
import { decodePath, encodePath } from './polyline'

describe('encodePath / decodePath', () => {
  it('round-trips a path back to its points (1e-5 precision)', () => {
    const path: [number, number][] = [
      [52.5163, 13.3777],
      [52.517, 13.379],
      [52.5181, 13.3805],
    ]
    const decoded = decodePath(encodePath(path))
    expect(decoded).toHaveLength(path.length)
    decoded.forEach(([lat, lng], i) => {
      expect(lat).toBeCloseTo(path[i][0], 4)
      expect(lng).toBeCloseTo(path[i][1], 4)
    })
  })

  it('keeps the head at the parking it was seeded from (deleteParking match)', () => {
    const parking = { lat: 52.5163, long: 13.3777 }
    const [headLat, headLng] = decodePath(
      encodePath([
        [parking.lat, parking.long],
        [52.517, 13.379],
      ]),
    )[0]
    expect(Math.abs(headLat - parking.lat)).toBeLessThan(1e-4)
    expect(Math.abs(headLng - parking.long)).toBeLessThan(1e-4)
  })
})
