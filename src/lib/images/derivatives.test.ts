import { describe, expect, it } from 'vitest'
import { derivativePath, isDerivableImage, isDerivativeRequest, pickDerivativeSize } from './derivatives'

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

describe('isDerivativeRequest', () => {
  const url = (href: string) => new URL(href, 'https://grnyte.rocks')

  it('matches the URL Image.svelte builds for a derivative', () => {
    // Kept in lockstep with Image.svelte's `src`, which is the only thing that builds these.
    expect(isDerivativeRequest(url('/image/topos/138.jpg?w=256'))).toBe(true)
    expect(isDerivativeRequest(url('/image/user-content/a%20b.jpg?w=1024'))).toBe(true)
  })

  it('skips the full-res original, which is too big to cache first', () => {
    expect(isDerivativeRequest(url('/image/topos/138.jpg'))).toBe(false)
  })

  it('skips paths no image route serves', () => {
    // The regression this exists for: the matcher used to test /nextcloud/topos/, so it never fired.
    expect(isDerivativeRequest(url('/nextcloud/topos/138.jpg?w=256'))).toBe(false)
    expect(isDerivativeRequest(url('/api/tasks/cleanup-uploads'))).toBe(false)
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
