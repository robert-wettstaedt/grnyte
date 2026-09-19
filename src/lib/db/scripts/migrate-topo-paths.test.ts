import { describe, expect, it } from 'vitest'
import { normalizePath } from './migrate-topo-paths'

describe('normalizePath', () => {
  it('converts pixel coordinates to fractions, preserving M/L structure and the Z marker', () => {
    const result = normalizePath('M300,915 L285,770 Z', 800, 1000)
    expect(result.next).toBe('M0.375,0.915 L0.35625,0.77 Z')
  })

  it('handles multi-start (bracket) paths and lowercase letters', () => {
    const result = normalizePath('m560,905 l600,690 M640,905 L600,690 Z', 800, 1000)
    expect(result.next).toBe('M0.7,0.905 L0.75,0.69 M0.8,0.905 L0.75,0.69 Z')
  })

  it('skips already-normalized paths', () => {
    expect(normalizePath('M0.375,0.915 L0.35625,0.77 Z', 800, 1000)).toMatchObject({
      next: null,
      reason: 'normalized',
    })
  })

  it('skips coordinates that do not fit the image (dimension mismatch)', () => {
    expect(normalizePath('M300,915 L285,2400 Z', 800, 1000)).toMatchObject({ next: null, reason: 'out-of-bounds' })
  })

  it('converts a topout drawn just above the top edge', () => {
    // topo_route 1173: -53px on a 1024px photo is -0.0518, a real line whose topout sits off the
    // frame. Refusing it leaves the row in pixels, which the renderer draws nowhere near the photo.
    expect(normalizePath('M1754,660 L384,-53 Z', 1820, 1024)).toEqual({ next: 'M0.96374,0.64453 L0.21099,-0.05176 Z' })
  })

  it('still refuses an overshoot far past the top edge', () => {
    expect(normalizePath('M1754,660 L384,-150 Z', 1820, 1024)).toMatchObject({
      next: null,
      reason: 'out-of-bounds',
    })
  })

  it('skips unparsable paths', () => {
    expect(normalizePath('M300,915 C285,770 100,100 50,50', 800, 1000)).toMatchObject({
      next: null,
      reason: 'unparsable',
    })
  })
})
