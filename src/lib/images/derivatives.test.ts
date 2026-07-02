import { describe, expect, it } from 'vitest'
import { derivativePath, isDerivableImage, pickDerivativeSize } from './derivatives'

describe('derivativePath', () => {
  it('inserts the size before the extension', () => {
    expect(derivativePath('/topos/138.jpg', 1024)).toBe('/topos/138.1024.webp')
    expect(derivativePath('/user-content/a.b/photo.PNG', 256)).toBe('/user-content/a.b/photo.256.webp')
  })
})

describe('pickDerivativeSize', () => {
  it('picks the smallest size that still downscales', () => {
    expect(pickDerivativeSize(160)).toBe(256)
    expect(pickDerivativeSize(256)).toBe(256)
    expect(pickDerivativeSize(1000)).toBe(1024)
  })

  it('falls back to the largest for oversized requests', () => {
    expect(pickDerivativeSize(2048)).toBe(1024)
  })
})

describe('isDerivableImage', () => {
  it('accepts images, rejects other files and derivative/orig siblings', () => {
    expect(isDerivableImage('/topos/138.jpg')).toBe(true)
    expect(isDerivableImage('/topos/105.pdf')).toBe(false)
    expect(isDerivableImage('/topos/138.1024.webp')).toBe(false)
    expect(isDerivableImage('/topos/138.orig.jpg')).toBe(false)
  })
})
