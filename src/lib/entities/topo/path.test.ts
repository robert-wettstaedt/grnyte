import { describe, expect, it } from 'vitest'
import { convertPathToPoints } from './mapper'
import { buildLine, canEditPoints, isNormalized, serializePoints } from './path'

describe('isNormalized', () => {
  it('distinguishes 0–1 floats from pixel coords', () => {
    expect(isNormalized(convertPathToPoints('M0.7,0.4 L0.3,0.1'))).toBe(true)
    expect(isNormalized(convertPathToPoints('M765,688 L767,135'))).toBe(false)
  })
})

describe('canEditPoints', () => {
  it('allows already-normalized and cleanly-normalizable lines, blocks the rest', () => {
    // Already 0-1: editable regardless of dims.
    expect(canEditPoints(convertPathToPoints('M0.7,0.4 L0.3,0.1'))).toBe(true)
    // Pixel coords that divide cleanly into 0-1 by the given dims: editable.
    expect(canEditPoints(convertPathToPoints('M512,682 L768,341'), 1024, 1365)).toBe(true)
    // Pixel coords with no dims to normalize by: read-only (would mix spaces).
    expect(canEditPoints(convertPathToPoints('M512,682 L768,341'))).toBe(false)
    // Pixel coords that exceed the stored dims (mismatched space): read-only.
    expect(canEditPoints(convertPathToPoints('M1637,3121 L1040,350'), 1024, 1365)).toBe(false)
    // No points: trivially editable (nothing to mangle).
    expect(canEditPoints([])).toBe(true)
  })
})

describe('buildLine', () => {
  it('curves between points (cubic) and stays open', () => {
    const { d } = buildLine(convertPathToPoints('M100,900 L120,500 L110,200 Z'), true)
    expect(d.startsWith('M100,900')).toBe(true)
    expect(d).toContain('C')
    expect(d).not.toContain('Z')
  })

  it('draws straight segments when curved is false', () => {
    const { d } = buildLine(convertPathToPoints('M100,900 L120,500 L110,200 Z'), false)
    expect(d).toContain('L')
    expect(d).not.toContain('C')
  })

  it('scales normalized (0–1) coords to the image size', () => {
    const { starts } = buildLine(convertPathToPoints('M0.5,0.5 L0.5,0.1'), true, 200, 400)
    expect(starts[0]).toMatchObject({ x: 100, y: 200 })
  })

  it('brackets the two hands of a start and rises from their centre, with a single top', () => {
    const { bracket, d, starts, top } = buildLine(
      convertPathToPoints('M100,900 L150,700 M200,900 L150,700 L160,300 Z'),
      true,
    )
    expect(starts.map((s) => s.x).sort((a, b) => a - b)).toEqual([100, 200])
    // Bracket joins the holds in x-order; the line starts at their centroid x (150).
    expect(bracket).toBe('M100,900 L200,900')
    expect(d.startsWith('M150,900')).toBe(true)
    expect(top).toMatchObject({ x: 160, y: 300 })
  })

  it('leaves the bracket empty for a single-hold start', () => {
    const { bracket } = buildLine(convertPathToPoints('M100,900 L120,500 L110,200 Z'), true)
    expect(bracket).toBe('')
  })
})

describe('serializePoints', () => {
  it.each([
    'M0.5,0.5 L0.5,0.1 Z',
    'M100,900 L120,500 L110,200 Z',
    'M100,900 L150,700 M200,900 L150,700 L160,300 Z',
    'M0.7,0.4', // start only, no top
  ])('round-trips %s through convertPathToPoints', (path) => {
    expect(serializePoints(convertPathToPoints(path))).toBe(path)
  })
})
