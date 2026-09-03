import { describe, expect, it } from 'vitest'
import {
  DERIVATIVE_SIZES,
  derivativePath,
  imageSrc,
  isDerivableImage,
  isDerivativeRequest,
  pickDerivativeSize,
} from './derivatives'

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

describe('imageSrc', () => {
  it('normalises the leading slash exactly once', () => {
    expect(imageSrc('/topos/138.jpg', 256)).toBe('/image/topos/138.jpg?w=256')
    expect(imageSrc('topos/138.jpg', 256)).toBe('/image/topos/138.jpg?w=256')
    expect(imageSrc('///topos/138.jpg', 256)).toBe('/image/topos/138.jpg?w=256')
  })

  it('asks for the untouched original when no size is given', () => {
    expect(imageSrc('/topos/138.jpg')).toBe('/image/topos/138.jpg')
  })

  it('only ever emits a width that has a derivative behind it', () => {
    // The regression: `?w=512` used to typecheck, then the server rounded it up to the 1024
    // file, so three call sites shipped 4x the pixels they displayed. @ts-expect-error is the
    // guard now: if DerivativeSize ever widens to `number`, this line stops erroring and fails.
    // @ts-expect-error -- 512 is not a DerivativeSize
    expect(imageSrc('/topos/138.jpg', 512)).toBe('/image/topos/138.jpg?w=512')
    for (const size of DERIVATIVE_SIZES) {
      expect(imageSrc('/topos/138.jpg', size)).toBe(`/image/topos/138.jpg?w=${size}`)
    }
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
