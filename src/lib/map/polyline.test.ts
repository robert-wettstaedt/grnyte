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
})
