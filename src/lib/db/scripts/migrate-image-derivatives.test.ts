import { describe, expect, it } from 'vitest'
import { orientedDimensions } from './migrate-image-derivatives'

describe('orientedDimensions', () => {
  it('returns the stored dimensions for unrotated orientations', () => {
    expect(orientedDimensions({ width: 4032, height: 3024, orientation: 1 })).toEqual({ width: 4032, height: 3024 })
    expect(orientedDimensions({ width: 4032, height: 3024 })).toEqual({ width: 4032, height: 3024 })
  })

  it('swaps width and height for the 90°-rotated orientations (5–8)', () => {
    expect(orientedDimensions({ width: 4032, height: 3024, orientation: 6 })).toEqual({ width: 3024, height: 4032 })
    expect(orientedDimensions({ width: 4032, height: 3024, orientation: 8 })).toEqual({ width: 3024, height: 4032 })
  })

  it('returns null when dimensions are missing', () => {
    expect(orientedDimensions({})).toBeNull()
    expect(orientedDimensions({ width: 4032, orientation: 1 })).toBeNull()
    expect(orientedDimensions({ height: 3024 })).toBeNull()
  })
})
