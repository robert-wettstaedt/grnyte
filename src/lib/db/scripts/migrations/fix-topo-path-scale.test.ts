import { describe, expect, it } from 'vitest'
import { asMigrationWrote, parsePremigration, scalePath } from './fix-topo-path-scale'

/**
 * Ground truth from prod, topo 982 on a photo that is 4032x3024 now and was 1366x1024 before
 * promotion. `pixels` is the path read out of the 2026-09-18 pre-migration dump; `stored` is what
 * `migrate-topo-paths` left behind after dividing by the post-promotion size.
 *
 * Every number here is a literal. An earlier version derived the old size from the same constant
 * the function used, which made the assertion an identity that held for any value and passed a
 * mutation to 800.
 */
const WIDTH = 4032
const HEIGHT = 3024
const OLD_WIDTH = 1365.3333333333333
const OLD_HEIGHT = 1024
const SCALE = 2.953125

const ROWS = [
  {
    id: 1663,
    pixels: 'M783,684 M833,682 L865,418 L752,533 L1063,261 Z',
    stored: 'M0.1942,0.22619 M0.2066,0.22553 L0.21453,0.13823 L0.18651,0.17626 L0.26364,0.08631 Z',
  },
  {
    id: 1662,
    pixels: 'M646,689 M600,754 L411,305 L486,435 L500,592 L412,95 Z',
    stored: 'M0.16022,0.22784 M0.14881,0.24934 L0.10193,0.10086 L0.12054,0.14385 L0.12401,0.19577 L0.10218,0.03142 Z',
  },
  {
    id: 1801,
    pixels: 'M304,662 M419,662 L615,458 L865,418 L1063,261 Z',
    stored: 'M0.0754,0.21892 M0.10392,0.21892 L0.15253,0.15146 L0.21453,0.13823 L0.26364,0.08631 Z',
  },
]

const coordsOf = (path: string): [number, number][] =>
  path
    .trim()
    .split(/\s+/)
    .filter((token) => token.toUpperCase() !== 'Z')
    .map((token) => {
      const [x, y] = token.slice(1).split(',')
      return [Number(x), Number(y)]
    })

describe('scalePath', () => {
  it.each(ROWS)('row $id lands on the pre-migration pixels over the pre-promotion size', ({ pixels, stored }) => {
    const result = scalePath(stored, SCALE)
    expect(result.next).not.toBeNull()

    const expected = coordsOf(pixels).map(([x, y]) => [x / OLD_WIDTH, y / OLD_HEIGHT])
    const actual = coordsOf(result.next as string)

    expect(actual).toHaveLength(expected.length)
    actual.forEach(([x, y], index) => {
      expect(x).toBeCloseTo(expected[index][0], 4)
      expect(y).toBeCloseTo(expected[index][1], 4)
    })
  })

  it('reproduces the stored value from the pixels, which is what proves the cause', () => {
    // The migration divided by the POST-promotion size, and this is that division.
    expect(Number((783 / WIDTH).toFixed(5))).toBe(0.1942)
    expect(Number((684 / HEIGHT).toFixed(5))).toBe(0.22619)
  })

  it('keeps the Z markers and their positions', () => {
    const result = scalePath('M0.1,0.1 L0.2,0.2 Z', 2)
    expect(result.next).toBe('M0.2,0.2 L0.4,0.4 Z')
  })

  it('allows a topout drawn slightly above the top edge', () => {
    // 1152: -0.0269 at the current size becomes -0.05958, which a -0.05 tolerance would refuse.
    expect(scalePath('M0.33309,0.23633 L0.30903,-0.0269 Z', 2268 / 1024).next).toBe(
      'M0.73774,0.52343 L0.68445,-0.05958 Z',
    )
  })

  it('refuses a row whose result leaves the image', () => {
    expect(scalePath('M0.9,0.9 L0.95,0.95', SCALE)).toEqual({ next: null, reason: 'out-of-bounds' })
  })

  it('refuses a path it cannot parse', () => {
    expect(scalePath('garbage', SCALE)).toEqual({ next: null, reason: 'unparsable' })
  })
})

/** The real shape of `pg_restore --data-only --table=topo_routes`, columns in the dump's order. */
const DUMP = [
  'COPY public.topo_routes (id, top_type, path, route_fk, topo_fk, region_fk) FROM stdin;',
  '1663\ttopout\tM783,684 M833,682 L865,418 L752,533 L1063,261 Z\t6480\t982\t3',
  '1801\ttopout\tM304,662 M419,662 L615,458 L865,418 L1063,261 Z\t6676\t982\t3',
  '9999\ttopout\t\\N\t1\t1\t3',
  '\\.',
].join('\n')

describe('parsePremigration', () => {
  it('reads ids and paths, and drops null paths', () => {
    const rows = parsePremigration(DUMP)
    expect(rows.size).toBe(2)
    expect(rows.get(1663)).toBe('M783,684 M833,682 L865,418 L752,533 L1063,261 Z')
    expect(rows.has(9999)).toBe(false)
  })

  it('reads the column order from the header rather than assuming it', () => {
    const swapped = DUMP.replace(
      'COPY public.topo_routes (id, top_type, path, route_fk, topo_fk, region_fk)',
      'COPY public.topo_routes (path, top_type, id, route_fk, topo_fk, region_fk)',
    )
    // Same rows, columns declared in a different order: id is now the third cell.
    expect(parsePremigration(swapped).get(6480)).toBeUndefined()
  })

  it('refuses a dump with no topo_routes block', () => {
    expect(() => parsePremigration('COPY public.routes (id) FROM stdin;\n\\.')).toThrow(/no COPY block/)
  })
})

describe('asMigrationWrote', () => {
  it('reproduces exactly what migrate-topo-paths stored, which is the gate', () => {
    expect(asMigrationWrote(ROWS[0].pixels, WIDTH, HEIGHT)).toBe(ROWS[0].stored)
    expect(asMigrationWrote(ROWS[2].pixels, WIDTH, HEIGHT)).toBe(ROWS[2].stored)
  })

  it('does not match when the row was edited since', () => {
    expect(asMigrationWrote(ROWS[0].pixels, WIDTH, HEIGHT)).not.toBe('M0.5,0.5 Z')
  })
})
