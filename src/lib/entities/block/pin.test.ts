/** `usablePhotoCoordinates` is the gate between a photo's EXIF and a block's pin. Android returns
 *  the GPS tags zero-filled rather than absent, which an `== null` guard waves through. */
import { describe, expect, it } from 'vitest'
import { usablePhotoCoordinates } from './pin'

describe('usablePhotoCoordinates', () => {
  it('accepts a real pair', () => {
    expect(usablePhotoCoordinates({ latitude: 47.5, longitude: 11.5 })).toBe(true)
  })

  it('rejects the NaN pair Android hands back for a redacted photo', () => {
    expect(usablePhotoCoordinates({ latitude: NaN, longitude: NaN })).toBe(false)
  })

  it('rejects a pair that is only half NaN', () => {
    expect(usablePhotoCoordinates({ latitude: 47.5, longitude: NaN })).toBe(false)
  })

  it('rejects an absent or half-absent pair', () => {
    expect(usablePhotoCoordinates(undefined)).toBe(false)
    expect(usablePhotoCoordinates({})).toBe(false)
    expect(usablePhotoCoordinates({ latitude: 47.5 })).toBe(false)
  })

  it('rejects Infinity', () => {
    expect(usablePhotoCoordinates({ latitude: Infinity, longitude: 11.5 })).toBe(false)
  })

  it('rejects 0,0, which is a clean zero-fill rather than a location', () => {
    expect(usablePhotoCoordinates({ latitude: 0, longitude: 0 })).toBe(false)
  })

  it('still accepts a genuine zero on one axis', () => {
    expect(usablePhotoCoordinates({ latitude: 0, longitude: 11.5 })).toBe(true)
    expect(usablePhotoCoordinates({ latitude: 47.5, longitude: 0 })).toBe(true)
  })
})
