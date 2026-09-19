import { describe, expect, it } from 'vitest'
import { orientedDimensions } from '../../images/derivatives'

describe('orientedDimensions', () => {
  it('returns the stored dimensions for unrotated orientations', () => {
    expect(orientedDimensions({ height: 3024, orientation: 1, width: 4032 })).toEqual({ height: 3024, width: 4032 })
    expect(orientedDimensions({ height: 3024, width: 4032 })).toEqual({ height: 3024, width: 4032 })
  })

  it('swaps width and height for the 90°-rotated orientations (5–8)', () => {
    expect(orientedDimensions({ height: 3024, orientation: 6, width: 4032 })).toEqual({ height: 4032, width: 3024 })
    expect(orientedDimensions({ height: 3024, orientation: 8, width: 4032 })).toEqual({ height: 4032, width: 3024 })
  })

  it('returns null when dimensions are missing', () => {
    expect(orientedDimensions({})).toBeNull()
    expect(orientedDimensions({ orientation: 1, width: 4032 })).toBeNull()
    expect(orientedDimensions({ height: 3024 })).toBeNull()
  })
})
