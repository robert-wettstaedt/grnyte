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

describe('a photo that does not show the start or the top', () => {
  /**
   * Both ends are optional on a real topo: a boulder too big for one frame, a sit start in a cave.
   * `buildLine` used to read the start off the FIRST POINT and fall back to the LAST POINT for the
   * topout marker, so every such line got a start ring on a waypoint and an arrow on another.
   */
  it('gives a startless line no start holds at all', () => {
    const line = buildLine(convertPathToPoints('L0.75,0.74 L0.81,0.65 L0.93,0.13 Z'), true, 1000, 1000)
    expect(line.starts).toEqual([])
    expect(line.bracket).toBe('')
  })

  it('still runs a startless line through every one of its points', () => {
    const line = buildLine(convertPathToPoints('L0.75,0.74 L0.81,0.65 L0.93,0.13 Z'), false, 1000, 1000)
    expect(line.d).toBe('M750,740 L810,650 L930,130')
  })

  it('hangs the number badge under the foot of a startless line', () => {
    const line = buildLine(convertPathToPoints('L0.75,0.74 L0.81,0.65 L0.93,0.13 Z'), true, 1000, 1000)
    expect(line.anchor).toMatchObject({ x: 750, y: 740 })
  })

  it('gives a topless line no end marker', () => {
    // No `Z`, so no point is typed `top`. The old fallback marked the last waypoint instead.
    const line = buildLine(convertPathToPoints('M0.2,0.8 L0.5,0.6 L0.7,0.3'), true, 1000, 1000)
    expect(line.top).toBeUndefined()
  })

  it('writes a startless line back without inventing a start hold', () => {
    const path = 'L0.75,0.74 L0.81,0.65 L0.93,0.13 Z'
    const points = convertPathToPoints(path)
    expect(serializePoints(points)).toBe(path)
    expect(convertPathToPoints(serializePoints(points)).map((point) => point.type)).toEqual(['middle', 'middle', 'top'])
  })

  it('leaves a line that does show both ends exactly as it was', () => {
    const line = buildLine(convertPathToPoints('M0.1,0.9 M0.3,0.9 L0.5,0.6 L0.4,0.1 Z'), true, 1000, 1000)
    expect(line.starts.map((point) => point.x)).toEqual([100, 300])
    expect(line.top).toMatchObject({ x: 400, y: 100 })
    expect(line.anchor).toMatchObject({ x: 200, y: 900 })
  })
})

describe('a point stored twice', () => {
  /**
   * Real rows carry repeats: topo_route 2163 stores its top three times, 1827 its middle twice.
   * A zero-length segment gives Catmull-Rom a direction of nothing, which kinks the curve and can
   * bulge it past its own end. The points stay in the data; they just stop steering the line twice.
   */
  it('draws a doubled waypoint once', () => {
    const doubled = buildLine(convertPathToPoints('M0.2,0.8 L0.5,0.5 L0.5,0.5 L0.7,0.2 Z'), false, 1000, 1000)
    const once = buildLine(convertPathToPoints('M0.2,0.8 L0.5,0.5 L0.7,0.2 Z'), false, 1000, 1000)
    expect(doubled.d).toBe(once.d)
  })

  it('does not let a tripled top bulge the curve past it', () => {
    // topo_route 2163's shape. The last drawn point must be the top itself, not a control point
    // thrown beyond it by two zero-length segments.
    const line = buildLine(
      convertPathToPoints('M0.35,0.42 L0.55,0.41 L0.77,0.25 L0.77,0.25 L0.77,0.25 Z'),
      true,
      1000,
      1000,
    )
    expect(line.d.trimEnd().endsWith('770,250')).toBe(true)
    expect(line.d).not.toContain('770,250 C770,250')
  })

  it('keeps a point that repeats without being adjacent', () => {
    // Back to a hold it already used is a real move, not a stutter.
    const line = buildLine(convertPathToPoints('M0.2,0.8 L0.5,0.5 L0.6,0.4 L0.5,0.5 L0.7,0.2 Z'), false, 1000, 1000)
    expect(line.d).toBe('M200,800 L500,500 L600,400 L500,500 L700,200')
  })
})

describe('the number badge anchor', () => {
  it('hangs under the LOWEST start hold, not the average of them', () => {
    // Two holds at different heights: the badge must clear the lower one, so the anchor takes the
    // max y while its x is the centre. Equal-height holds cannot tell the two apart.
    const line = buildLine(convertPathToPoints('M0.1,0.7 M0.3,0.9 L0.5,0.5 L0.4,0.1 Z'), true, 1000, 1000)
    expect(line.anchor).toMatchObject({ x: 200, y: 900 })
  })
})

describe('consecutive points that differ in only one axis', () => {
  it('keeps two points that share an x but not a y', () => {
    const line = buildLine(convertPathToPoints('M0.2,0.8 L0.5,0.6 L0.5,0.4 L0.7,0.2 Z'), false, 1000, 1000)
    expect(line.d).toBe('M200,800 L500,600 L500,400 L700,200')
  })

  it('keeps two points that share a y but not an x', () => {
    const line = buildLine(convertPathToPoints('M0.2,0.8 L0.4,0.6 L0.6,0.6 L0.7,0.2 Z'), false, 1000, 1000)
    expect(line.d).toBe('M200,800 L400,600 L600,600 L700,200')
  })
})

describe('a line with two start holds', () => {
  it('rises from the centre of the holds without doubling back through one of them', () => {
    // The trunk opens at whichever hold it belongs to, and that hold is already represented by the
    // centroid. Leaving it in the line makes it jog from the centre out to the hold and back.
    const line = buildLine(convertPathToPoints('M0.1,0.9 M0.3,0.9 L0.5,0.6 L0.4,0.1 Z'), false, 1000, 1000)
    expect(line.d).toBe('M200,900 L500,600 L400,100')
  })
})

describe('the badge on a line whose points are not yet in climbed order', () => {
  it('hangs under the lowest point, not the first one', () => {
    // topo_route 419's live shape: y runs 0.467, 0.647, 0.740, then the top at 0.133. The first
    // point is mid-face; the lowest is 0.740, and that is where the badge belongs.
    const line = buildLine(
      convertPathToPoints('L0.89161,0.46727 L0.81347,0.64747 L0.75195,0.73976 L0.92967,0.1333 Z'),
      true,
      1000,
      1000,
    )
    expect(line.anchor?.y).toBeCloseTo(739.76, 1)
  })
})
