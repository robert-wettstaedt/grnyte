import { describe, expect, it } from 'vitest'
import {
  byPage,
  ChangeLog,
  conflicts,
  fbLabel,
  parsePlan,
  planLabel,
  planNewBlocks,
  splitFirstAscent,
  staleFields,
  type Create,
  type RouteState,
} from './guidebookPlan'

const create = (overrides: Partial<Create>): Create => ({
  area: 10,
  block: null,
  book: 'Band 2',
  book_block: '3',
  description: null,
  first_ascent: null,
  first_ascent_year: null,
  grade: '6A',
  name: 'Kante',
  new_block: '',
  page: 40,
  y: 100,
  ...overrides,
})

describe('parsePlan', () => {
  it('fills every absent list', () => {
    expect(parsePlan({ delete: [4] })).toEqual({
      block_renames: [],
      create: [],
      delete: [4],
      delete_blocks: [],
      merge: [],
      moves: [],
      new_sectors: [],
      relics: {},
      sector_parents: [],
      sector_renames: [],
      updates: {},
    })
  })

  it('names every malformed entry at once', () => {
    const run = () =>
      parsePlan({
        relics: { 'topos:3': 'x' },
        typo: [],
        updates: { '5': { grade: { new: 7, old: '6A' } } },
      })
    expect(run).toThrow(/relics\.topos:3/)
    expect(run).toThrow(/updates\.5\.grade\.new/)
    expect(run).toThrow(/typo/)
  })
})

describe('splitFirstAscent', () => {
  it('splits on every separator the book uses', () => {
    expect(splitFirstAscent('A. Fels, B. Berg & C. Stein und D. Moos / E. Kurz/F. Hang')).toEqual([
      'A. Fels',
      'B. Berg',
      'C. Stein',
      'D. Moos',
      'E. Kurz',
      'F. Hang',
    ])
  })

  it('keeps a comma without a space inside a name, and reads nothing as nobody', () => {
    expect(splitFirstAscent('Fels,jun.')).toEqual(['Fels,jun.'])
    expect(splitFirstAscent(null)).toEqual([])
    expect(splitFirstAscent('  ')).toEqual([])
  })
})

describe('grade labels', () => {
  it('maps the plan label to grades.FB and back', () => {
    expect(fbLabel('6C+')).toBe('FB 6C+')
    expect(planLabel('FB 6C+')).toBe('6C+')
    expect(planLabel('FB 4')).toBe('4')
    expect(planLabel(null)).toBeNull()
  })
})

describe('staleFields', () => {
  const state: RouteState = {
    description: null,
    first_ascent: ['B. Berg', 'A. Fels'],
    first_ascent_year: 1987,
    grade: '6C+',
    name: 'Kante',
  }

  it('accepts the exporter spelling of the stored values', () => {
    expect(
      staleFields(
        state,
        {
          description: { new: 'x', old: '' },
          first_ascent: { new: 'C. Stein', old: ['a. fels', 'B. Berg'] },
          first_ascent_year: { new: 1990, old: 1987 },
          grade: { new: '7A', old: '6C+' },
          name: { new: 'Kante direkt', old: 'Kante' },
        },
        'old',
      ),
    ).toEqual([])
  })

  it('names each field that moved since the plan', () => {
    expect(
      staleFields(
        state,
        {
          description: { new: null, old: 'Old text' },
          first_ascent: { new: null, old: ['A. Fels'] },
          first_ascent_year: { new: 1990, old: null },
          grade: { new: '7A', old: '6C' },
          name: { new: 'x', old: 'kante' },
        },
        'old',
      ),
    ).toEqual(['name', 'grade', 'first_ascent_year', 'description', 'first_ascent'])
  })

  it('reads the new first ascent as the string it is written as', () => {
    const update = { first_ascent: { new: 'A. Fels & B. Berg', old: null } }
    expect(staleFields(state, update, 'new')).toEqual([])
    expect(staleFields({ ...state, first_ascent: ['A. Fels'] }, update, 'new')).toEqual(['first_ascent'])
  })
})

describe('ChangeLog', () => {
  it('keeps the first old value and the last new one, as text', () => {
    const log = new ChangeLog()
    log.record('block', 3, 'name', 'Nordwand', 'Nord')
    log.record('block', 3, 'name', 'Nord', 'Nordblock')
    log.record('route', 9, 'gradeFk', 9, 11)
    expect(log.events()).toEqual([
      { changes: [{ columnName: 'name', newValue: 'Nordblock', oldValue: 'Nordwand' }], id: 3, kind: 'block' },
      { changes: [{ columnName: 'gradeFk', newValue: '11', oldValue: '9' }], id: 9, kind: 'route' },
    ])
  })

  it('drops columns, and entities, that ended where they started', () => {
    const log = new ChangeLog()
    log.record('route', 1, 'description', '', null)
    log.record('route', 2, 'name', 'A', 'B')
    log.record('route', 2, 'firstAscentYear', null, null)
    log.record('area', 5, 'name', 'A', 'B')
    log.record('area', 5, 'name', 'B', 'A')
    expect(log.events()).toEqual([
      { changes: [{ columnName: 'name', newValue: 'B', oldValue: 'A' }], id: 2, kind: 'route' },
    ])
  })
})

describe('planNewBlocks', () => {
  it('shares a block between creates and moves of one book block, in page order', () => {
    const plan = {
      create: [
        create({ book_block: '7', name: 'late', page: 41, y: 10 }),
        create({ book_block: '3', name: 'low', page: 40, y: 300 }),
        create({ book_block: '3', name: 'high', page: 40, y: 20 }),
        create({ block: 99, book_block: '1', new_block: null }),
      ],
      moves: [
        { block: null, book_block: '3', new_block: '', route: 501 },
        { block: null, book_block: '12', new_block: 'Turm', route: 502 },
        { block: null, book_block: '2', new_block: 'Ecke', route: 503 },
      ],
    }
    const { blocks, errors } = planNewBlocks(plan, () => 10)
    expect(errors).toEqual([])
    expect(blocks.map((block) => [block.bookBlock, block.name, block.moves])).toEqual([
      ['3', '', [501]],
      ['7', '', []],
      ['2', 'Ecke', [503]],
      ['12', 'Turm', [502]],
    ])
    expect([...blocks[0].creates].sort(byPage).map((c) => c.name)).toEqual(['high', 'low'])
  })

  it('keys by area, and refuses one book block under two names', () => {
    const { blocks, errors } = planNewBlocks(
      {
        create: [create({ area: 10, new_block: 'A' }), create({ area: 11, new_block: 'B' })],
        moves: [{ block: null, book_block: '3', new_block: 'C', route: 1 }],
      },
      () => 10,
    )
    expect(blocks.map((block) => block.area)).toEqual([10, 11])
    expect(errors).toEqual(['move of route 1 names new block "C", another entry "A"'])
  })

  it('refuses an entry that names no block at all', () => {
    const { errors } = planNewBlocks({ create: [create({ new_block: null })], moves: [] }, () => 10)
    expect(errors).toEqual(['create "Kante" (page 40) names neither a block nor a new block with its book block'])
  })
})

describe('conflicts', () => {
  it('refuses instructions that cannot all hold', () => {
    const plan = parsePlan({
      delete: [8, 8, 4],
      merge: [
        [1, 2],
        [2, 3],
        [5, 4],
      ],
      moves: [{ block: 7, book_block: null, new_block: null, route: 4 }],
      relics: { 'routes:6': 'text' },
      updates: { '1': { name: { new: 'x', old: 'y' } }, '6': { description: { new: 'a', old: null } } },
    })
    expect(conflicts(plan)).toEqual([
      'deleted route 8 is listed twice',
      'route 1 is merged away but also updated',
      'route 2 is merged away but also kept',
      'route 4 keeps a merge but is also deleted',
      'route 4 is deleted but also moved',
      'route 6 has a relic and a description update',
    ])
  })

  it('refuses new sectors that share a block, a key, or have no name', () => {
    const sector = (key: string, name: string, blocks: number[]) => ({
      area: 9,
      blocks,
      book_blocks: [],
      description: null,
      key,
      name,
    })
    const plan = parsePlan({
      delete_blocks: [3],
      new_sectors: [
        sector('9:0', 'Pilz', [1, 2]),
        sector('9:0', ' ', [2, 3]),
        { ...sector('9:1', 'Dach', []), keep: [3, 4] },
      ],
    })
    expect(conflicts(plan)).toEqual([
      'new sector key 9:0 is listed twice',
      'block put into a new sector 2 is listed twice',
      'block 3 is deleted but also put into a new sector',
      'new sector 9:0 has no name; a sector must have one',
      'new sector 9:1 keeps block 4, not deleted',
    ])
  })
})
