import { describe, expect, it } from 'vitest'
import { convertPathToPoints } from '../../entities/topo/mapper'
import { asRowId, collectEditedInV2, looksLikePixels, orderPoints, reorderPath } from './fix-topo-point-order'

/**
 * Ground truth from prod: topo_route 1843, the row that showed the loop. Its three middles are in
 * exact ascending `x + y`, which is v1's writer, and the expected order is v1's viewer walking them
 * nearest-first from the start hold.
 *
 * Every coordinate is a literal. Deriving the expectation from the same walk the function runs
 * would make the assertion an identity that any ordering satisfies.
 */
const ROW_1843 =
  'M0.43556,0.63353 M0.43556,0.63353 L0.81542,0.43727 L0.69824,0.61012 L0.80275,0.58959 L0.69726,0.27978 Z'
const ROW_1843_FIXED =
  'M0.43556,0.63353 M0.43556,0.63353 L0.69824,0.61012 L0.80275,0.58959 L0.81542,0.43727 L0.69726,0.27978 Z'

/** A square frame, so a fixture written in fractions is read back as those same fractions. */
const SQUARE = { height: 1000, width: 1000 }

describe('reorderPath', () => {
  it('walks topo_route 1843 into climbed order', () => {
    // 1843's own photo, whose exact pixel size is not to hand. Asserted across portrait, square and
    // landscape instead: its answer is the same in all three, so the test does not rest on a
    // dimension nobody has checked.
    for (const size of [{ height: 4032, width: 3024 }, SQUARE, { height: 3024, width: 4032 }]) {
      expect(reorderPath(ROW_1843, size)).toEqual({ next: ROW_1843_FIXED })
    }
  })

  it('keeps the top last even though it is the closest point to the last middle', () => {
    // The top (0.69726,0.27978) is nearer to the first middle than any other pair here, so a walk
    // that treated it as an ordinary point would visit it second.
    expect(reorderPath(ROW_1843, SQUARE).next?.endsWith('L0.69726,0.27978 Z')).toBe(true)
  })

  it('leaves both start holds where they were', () => {
    expect(reorderPath(ROW_1843, SQUARE).next?.startsWith('M0.43556,0.63353 M0.43556,0.63353 L')).toBe(true)
  })

  it('measures the gap between two points, not the sum of their coordinates', () => {
    // Both middles sit on the ascending sweep, so only the distance decides. From the start hold
    // (0.8,0.9) the near middle is (0.75,0.85); adding coordinates instead of subtracting puts
    // the far one (0.05,0.1) first, which reads as a no-op and leaves the row alone.
    expect(reorderPath('M0.8,0.9 L0.05,0.1 L0.75,0.85 L0.4,0.05 Z', SQUARE)).toEqual({
      next: 'M0.8,0.9 L0.75,0.85 L0.05,0.1 L0.4,0.05 Z',
    })
  })

  it('seeds the walk at the centre of two start holds, not at either one', () => {
    // Nearest to the centre (0.5,0.9) is (0.55,0.85); nearest to the left hold alone is (0.2,0.7).
    expect(reorderPath('M0.1,0.9 M0.9,0.9 L0.2,0.7 L0.55,0.85 L0.5,0.2 Z', SQUARE)).toEqual({
      next: 'M0.1,0.9 M0.9,0.9 L0.55,0.85 L0.2,0.7 L0.5,0.2 Z',
    })
  })

  it('walks a path whose start hold is not written first', () => {
    // topo_route 3 (route 42). The leading `L` is a waypoint, but `toSubPaths` reads the start hold
    // off the first POSITION, so prod draws that waypoint as a second start ring.
    expect(
      reorderPath('L0.73242,0.48938 M0.31836,0.62564 L0.54883,0.61026 L0.80957,0.22051 Z', {
        height: 1365,
        width: 1024,
      }),
    ).toEqual({ next: 'M0.31836,0.62564 L0.54883,0.61026 L0.73242,0.48938 L0.80957,0.22051 Z' })
  })

  it('walks a path whose waypoints are in no particular order', () => {
    // topo_route 376 (route 5337): right, further right, back across the face, then the top.
    expect(
      reorderPath('M0.14066,0.64258 L0.56044,0.39063 L0.78828,0.43262 L0.20806,0.46875 L0.79487,0.33398 Z', {
        height: 1024,
        width: 1365,
      }),
    ).toEqual({ next: 'M0.14066,0.64258 L0.20806,0.46875 L0.56044,0.39063 L0.78828,0.43262 L0.79487,0.33398 Z' })
  })

  it('refuses a path with two points typed top, which the walk would silently thin', () => {
    // `orderPoints` carries one top. Walking this would drop a point rather than move it.
    expect(reorderPath('M0.1,0.9 L0.2,0.5 Z L0.3,0.2 Z', SQUARE)).toEqual({
      next: null,
      reason: 'multiple-tops',
    })
  })

  it('reports a sweep the walk agrees with as a no-op rather than rewriting it', () => {
    // Ascending in x+y AND already nearest-first: v1 and v2 draw this identically.
    expect(reorderPath('M0.1,0.9 L0.2,0.8 L0.3,0.7 L0.4,0.1 Z', SQUARE)).toEqual({
      next: null,
      reason: 'already-ordered',
    })
  })

  it('walks topo_route 1806 the way v1 drew it, with no start hold at all', () => {
    // route 6682, photo 3024x4032. v1 began at the first waypoint, walked nearest-first, reversed,
    // then appended the top, which turns the stored sweep back into a bottom-to-top climb.
    expect(
      reorderPath('L0.89161,0.46727 L0.81347,0.64747 L0.75195,0.73976 L0.92967,0.1333 Z', {
        height: 4032,
        width: 3024,
      }),
    ).toEqual({ next: 'L0.75195,0.73976 L0.81347,0.64747 L0.89161,0.46727 L0.92967,0.1333 Z' })
  })

  it('walks a startless line rather than just reversing what was stored', () => {
    // 1806 cannot prove this: its stored order reversed happens to equal the walk. Here it does
    // not. Stored is a genuine sweep (x+y of 0.3, 0.6, 0.7) so the reversal applies, but from
    // (0.1,0.2) the nearer point is (0.2,0.5) rather than the stored-next (0.5,0.1). The walk is
    // therefore P1,P3,P2 and the output its reverse; merely reversing stored would give P3,P2,P1.
    expect(reorderPath('L0.1,0.2 L0.5,0.1 L0.2,0.5 L0.6,0.6 Z', SQUARE)).toEqual({
      next: 'L0.5,0.1 L0.2,0.5 L0.1,0.2 L0.6,0.6 Z',
    })
  })

  it('handles a startless line that is only a top', () => {
    expect(reorderPath('L0.5,0.5 Z', SQUARE)).toEqual({ next: null, reason: 'already-ordered' })
  })

  it('writes a startless line back with no start hold', () => {
    const next = reorderPath('L0.89161,0.46727 L0.81347,0.64747 L0.75195,0.73976 L0.92967,0.1333 Z', {
      height: 4032,
      width: 3024,
    }).next
    expect(next).not.toContain('M')
  })

  it('does not reverse a startless line that has no top either', () => {
    // v1 reversed only when there was a top to append, so a startless traverse keeps its walk order.
    const path = 'L0.1571,0.40625 L0.35267,0.32129 L0.47351,0.53028'
    expect(reorderPath(path, { height: 2268, width: 4032 })).toEqual({ next: null, reason: 'already-ordered' })
  })

  it('reports a single-middle line as ordered, from the walk rather than from a count', () => {
    expect(reorderPath('M0.2,0.8 L0.5,0.6 L0.25,0.1 Z', SQUARE)).toEqual({ next: null, reason: 'already-ordered' })
  })

  it('reports a line with no middle at all as ordered', () => {
    expect(reorderPath('M0.2,0.8 L0.25,0.1 Z', SQUARE)).toEqual({ next: null, reason: 'already-ordered' })
  })

  it('walks a line that was never topped out, which stores no Z', () => {
    expect(reorderPath('M0.8,0.9 L0.05,0.1 L0.75,0.85', SQUARE)).toEqual({
      next: 'M0.8,0.9 L0.75,0.85 L0.05,0.1',
    })
  })

  it('refuses an empty path, which parses to no tokens at all', () => {
    expect(reorderPath('   ', SQUARE)).toEqual({ next: null, reason: 'unparsable' })
  })

  it('refuses a path it cannot parse', () => {
    expect(reorderPath('M0.2,0.8 Q0.5,0.6', SQUARE)).toEqual({ next: null, reason: 'unparsable' })
  })
})

describe('the rewrite is a permutation', () => {
  /**
   * The property the whole migration rests on: no coordinate is moved, added, dropped or
   * reprecisioned, and no point changes which letter carries it. Asserted over every fixture in
   * this file that produces an output, and verified separately against all 527 rows of the prod
   * dry-run plan.
   */
  const CASES = [
    [ROW_1843, SQUARE],
    ['M0.8,0.9 L0.05,0.1 L0.75,0.85 L0.4,0.05 Z', SQUARE],
    ['M0.1,0.9 M0.9,0.9 L0.2,0.7 L0.55,0.85 L0.5,0.2 Z', SQUARE],
    ['M0.8,0.9 L0.05,0.1 L0.75,0.85', SQUARE],
    [
      'M0.4922,0.5559 L0.75488,0.2146 L0.70116,0.34277 L0.6123,0.46949 L0.71678,0.0725 Z',
      { height: 4032, width: 3024 },
    ],
  ] as const

  it.each(CASES)('keeps every token of %s', (path, size) => {
    const next = reorderPath(path, size).next
    expect(next).not.toBeNull()

    const tokens = (value: string) => value.trim().split(/\s+/)
    expect(tokens(next!).toSorted()).toEqual(tokens(path).toSorted())
    expect(tokens(next!).map((token) => token[0])).toEqual(tokens(path).map((token) => token[0]))
  })
})

describe('the image frame', () => {
  /**
   * `migrate-topo-paths` divided x by the width and y by the height, which are different numbers on
   * any photo that is not square. The walk has to undo that before it measures anything, and these
   * two fixtures are the ones that fail if it forgets.
   */
  it('reads a path that is still in pixels as pixels, not as fractions to scale again', () => {
    // A path `migrate-topo-paths` refused still holds v1's own pixels. From (900,500) the nearer
    // middle is (1100,500) at 200px; (900,710) is 210px away. Scale those by 1820x1024 as though
    // they were fractions and the ranks swap, because x stretches 1.78 times harder than y.
    const points = convertPathToPoints('M900,500 L1100,500 L900,710 L1000,100 Z')
    const walked = orderPoints(points, { height: 1024, width: 1820 })
      .filter((point) => point.type === 'middle')
      .map((point) => `${point.x},${point.y}`)

    expect(walked).toEqual(['1100,500', '900,710'])
  })

  it('walks topo_route 1173, a real pixel-space row, the way v1 drew it', () => {
    const pixels = 'M1754,660 L506,114 L688,109 L1183,332 L384,-53 Z'
    expect(reorderPath(pixels, { height: 1024, width: 1820 })).toEqual({
      next: 'M1754,660 L1183,332 L688,109 L506,114 L384,-53 Z',
    })
  })

  it('ranks two candidates by the frame they were drawn in', () => {
    // From the centre (0.5,0.5): (0.5,0.72) is 0.22 away down, (0.76,0.5) is 0.26 away across. On a
    // square frame the first wins; stretch the height four times and the second does.
    const points = convertPathToPoints('M0.5,0.5 L0.5,0.72 L0.76,0.5 L0.9,0.9 Z')
    const walked = (size: { height: number; width: number }) =>
      orderPoints(points, size)
        .filter((point) => point.type === 'middle')
        .map((point) => point.y)

    expect(walked(SQUARE)).toEqual([0.72, 0.5])
    expect(walked({ height: 4000, width: 1000 })).toEqual([0.5, 0.72])
  })
})

describe('what v2 has already drawn', () => {
  const lines = (entries: [route: number, path: string][]) =>
    entries.map(([routeFk, path]) => `${routeFk}:topout:${path}:name`).join('|')

  const event = (topoId: number, before: string, after: string) => ({
    metadata: JSON.stringify({ action: 'lines', topoId }),
    newValue: after,
    oldValue: before,
  })

  it('protects only the line a save redrew, not the photo it sat on', () => {
    // Topo 982's shape: one line redrawn in v2, three legacy lines carried along untouched. The
    // photo-wide guard froze all four and left them looped.
    const before = lines([
      [6479, 'M0.1,0.9 L0.2,0.5 Z'],
      [6480, 'M0.3,0.9 L0.4,0.5 Z'],
      [6676, 'M0.5,0.9 L0.6,0.5 Z'],
    ])
    const after = lines([
      [6479, 'M0.1,0.9 L0.2,0.5 Z'],
      [6480, 'M0.3,0.9 L0.45,0.4 Z'],
      [6676, 'M0.5,0.9 L0.6,0.5 Z'],
    ])

    expect(collectEditedInV2([event(982, before, after)])).toEqual({
      routes: new Set([6480]),
      topos: new Set(),
    })
  })

  it('protects a line the save added', () => {
    const before = lines([[6479, 'M0.1,0.9 L0.2,0.5 Z']])
    const after = lines([
      [6479, 'M0.1,0.9 L0.2,0.5 Z'],
      [7055, 'M0.7,0.9 L0.8,0.5 Z'],
    ])

    expect(collectEditedInV2([event(982, before, after)]).routes).toEqual(new Set([7055]))
  })

  it('does not protect a line the save only erased, which no longer has a row to walk', () => {
    const before = lines([
      [6479, 'M0.1,0.9 L0.2,0.5 Z'],
      [6480, 'M0.3,0.9 L0.4,0.5 Z'],
    ])
    const after = lines([[6479, 'M0.1,0.9 L0.2,0.5 Z']])

    expect(collectEditedInV2([event(982, before, after)]).routes).toEqual(new Set())
  })

  it('protects the whole photo when a save had no BEFORE side', () => {
    // Equivalent protection either way: the photo carried nothing before, so every line on it now
    // was drawn by that save. Reading it as a diff would put them all in `added` and protect the
    // same set; the photo guard is the same answer by the shorter route.
    const after = lines([[6480, 'M0.3,0.9 L0.45,0.4 Z']])
    expect(
      collectEditedInV2([
        { metadata: JSON.stringify({ action: 'lines', topoId: 982 }), newValue: after, oldValue: null },
      ]),
    ).toEqual({ routes: new Set(), topos: new Set([982]) })
  })

  it('falls back to the whole photo when only the AFTER side is unreadable', () => {
    // The leak the both-sides fixture missed. `newValue` says what the save drew; unreadable beside
    // a readable `oldValue` puts every line in `removed`, so added and redrawn are both empty and
    // nothing at all was protected.
    expect(
      collectEditedInV2([
        {
          metadata: JSON.stringify({ action: 'lines', topoId: 982 }),
          newValue: 'not|line|state',
          oldValue: '55:top:M0.1,0.9 L0.2,0.1 Z:Foo',
        },
      ]),
    ).toEqual({ routes: new Set(), topos: new Set([982]) })
  })

  it('falls back to the whole photo when a save erased every line', () => {
    // `newValue` is legitimately empty. Nothing survives on the photo to protect, so this costs
    // nothing, but it was leaking for the same reason as the case above.
    expect(
      collectEditedInV2([
        {
          metadata: JSON.stringify({ action: 'lines', topoId: 982 }),
          newValue: '',
          oldValue: '55:top:M0.1,0.9 L0.2,0.1 Z:Foo',
        },
      ]),
    ).toEqual({ routes: new Set(), topos: new Set([982]) })
  })

  it('falls back to the whole photo when a change row holds something it cannot parse', () => {
    // `parseTopoLines` drops entries it cannot read, so an unreadable value looks exactly like
    // "nothing changed". Reading it that way would hand every line on the photo to the walk.
    expect(
      collectEditedInV2([
        { metadata: JSON.stringify({ action: 'lines', topoId: 982 }), newValue: 'not|line|state', oldValue: 'garbage' },
      ]),
    ).toEqual({ routes: new Set(), topos: new Set([982]) })
  })

  it('falls back to the whole photo when the change rows cannot be read', () => {
    expect(
      collectEditedInV2([
        { metadata: JSON.stringify({ action: 'lines', topoId: 982 }), newValue: null, oldValue: null },
      ]),
    ).toEqual({ routes: new Set(), topos: new Set([982]) })
  })

  it('ignores topo events that are not a redraw', () => {
    expect(
      collectEditedInV2([
        { metadata: JSON.stringify({ action: 'photoAdded', topoId: 982 }), newValue: null, oldValue: null },
        { metadata: null, newValue: null, oldValue: null },
        { metadata: 'not json', newValue: null, oldValue: null },
      ]),
    ).toEqual({ routes: new Set(), topos: new Set() })
  })
})

describe('row ids off the environment', () => {
  it('takes a row id', () => {
    expect(asRowId('TOPO_ID', '1123')).toBe(1123)
  })

  it('refuses a typo rather than matching nothing', () => {
    // `Number('11 23')` is NaN, which matched no row and printed "0 path(s) would be reordered"
    // as though the data were already clean.
    expect(() => asRowId('TOPO_ID', '11 23')).toThrow('not a row id')
    expect(() => asRowId('SKIP_IDS', '')).toThrow('not a row id')
    expect(() => asRowId('TOPO_ID', '11.5')).toThrow('not a row id')
  })
})

describe('spotting a path still in pixels', () => {
  it('flags a real pixel path', () => {
    expect(looksLikePixels('M1078,2560 L1089,1821 Z')).toBe(true)
  })

  it('does not flag a normalized path', () => {
    expect(looksLikePixels('M0.5,0.5 L0.6,0.1 Z')).toBe(false)
  })

  it.each(['', 'Q1,2', 'nonsense', 'Z'])('does not flag %o, which holds no points at all', (path) => {
    // `convertPathToPoints` returns [] for all of these and `isNormalized([])` is false, so each
    // was reported as pixel-space as well as unparsable. `Z` alone parses to one TOKEN and no
    // points, which is why the count has to be of points.
    expect(looksLikePixels(path)).toBe(false)
  })
})

describe('running the repair twice', () => {
  /**
   * The walk must be a fixed point, not an involution. The startless branch reverses, so seeded at
   * the stored first point it flipped a corrected line back on a second run: five prod rows were
   * proposed for un-doing by a later dry run. Every shape is checked here, not just the one that
   * broke, because the next shape to grow a reversal will not announce itself.
   */
  const CASES: [label: string, path: string, size: { height: number; width: number }][] = [
    [
      'startless with a top (1806)',
      'L0.89161,0.46727 L0.81347,0.64747 L0.75195,0.73976 L0.92967,0.1333 Z',
      { height: 4032, width: 3024 },
    ],
    ['startless, no top (1126)', 'L0.1571,0.40625 L0.34496,0.09668 L0.35267,0.32129', { height: 2268, width: 4032 }],
    [
      'two start holds (1843)',
      'M0.43556,0.63353 M0.43556,0.63353 L0.81542,0.43727 L0.69824,0.61012 L0.80275,0.58959 L0.69726,0.27978 Z',
      { height: 4032, width: 3024 },
    ],
    ['one start hold', 'M0.2,0.8 L0.5,0.6 L0.3,0.4 L0.25,0.1 Z', { height: 1000, width: 1000 }],
  ]

  it.each(CASES)('leaves %s alone on a second pass', (_label, path, size) => {
    const once = reorderPath(path, size).next ?? path
    expect(reorderPath(once, size)).toEqual({ next: null, reason: 'already-ordered' })
  })

  it('still produces v1 order on the first pass', () => {
    // The guard must not cost the repair itself: sweep input walks exactly as before.
    expect(
      reorderPath('L0.89161,0.46727 L0.81347,0.64747 L0.75195,0.73976 L0.92967,0.1333 Z', {
        height: 4032,
        width: 3024,
      }),
    ).toEqual({ next: 'L0.75195,0.73976 L0.81347,0.64747 L0.89161,0.46727 L0.92967,0.1333 Z' })
  })
})
