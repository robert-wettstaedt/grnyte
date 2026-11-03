import { describe, expect, it } from 'vitest'
import { ChangeLog, fbLabel, holds, NEW_LINK, parseOps, planLabel } from './guidebookPlan'

const list = (ops: unknown[]) => ({ fp: {}, ops, refs: [], source: 'Book-2026' })

describe('parseOps', () => {
  it('reads every operation kind step 3 writes', () => {
    const ops = parseOps(
      list([
        { key: 'heiko', name: 'Heiko', op: 'create_fa' },
        { description: null, key: 'a2:r1', name: 'Hang', op: 'create_area', parent: { id: 4 }, type: 'sector' },
        { id: 5, op: 'update_area', set: { parent: { new: { key: 'a2:r1' }, old: { id: null } } } },
        {
          area: { key: 'a2:r1' },
          description: null,
          key: 'b:r1',
          name: null,
          op: 'create_block',
          order: 0,
          point: { estimated: true, lat: 49.7, lng: 11.4 },
        },
        { id: 6, op: 'update_block', set: { point: { new: { estimated: false, lat: 1, lng: 2 }, old: null } } },
        {
          block: { key: 'b:r1' },
          description: 'Wie !routes:new:r2!.',
          first_ascent: [{ key: 'heiko' }],
          first_ascent_year: 2001,
          grade: '7A',
          key: 'r1',
          name: 'Kante',
          op: 'create_route',
          rating: 2,
          tags: ['high'],
        },
        {
          add_tags: ['sit start'],
          id: 7,
          op: 'update_route',
          set: { first_ascent: { new: [{ id: 3 }], old: ['A. Fels'] }, grade: { new: '7A', old: '6C' } },
        },
        { id: 3, new: 'Anna Fels', old: 'anna fels', op: 'rename_fa' },
        { id: 4, op: 'delete_fa' },
        { gone: 8, into: 7, op: 'merge_route' },
        { id: 9, op: 'delete_area' },
      ]),
    )
    expect(ops.ops.map((o) => o.op)).toEqual([
      'create_fa',
      'create_area',
      'update_area',
      'create_block',
      'update_block',
      'create_route',
      'update_route',
      'rename_fa',
      'delete_fa',
      'merge_route',
      'delete_area',
    ])
  })

  it('reads the region the list was built for, and a list from before it was recorded', () => {
    expect(parseOps({ ...list([]), region: 32 }).region).toBe(32)
    expect(parseOps(list([])).region).toBeUndefined()
    expect(() => parseOps({ ...list([]), region: 'x' })).toThrow(/region/)
  })

  it('names every malformed entry at once', () => {
    const run = () =>
      parseOps(
        list([
          { id: 1, op: 'move_route' },
          { id: 5, op: 'update_route', set: { grade: { new: 7, old: '6A' } } },
          { gone: 0, into: 2, op: 'merge_block' },
        ]),
      )
    expect(run).toThrow(/ops\.0/)
    expect(run).toThrow(/ops\.1\.set\.grade\.new/)
    expect(run).toThrow(/ops\.2\.gone/)
  })
})

describe('holds', () => {
  it('reads null and an empty text as one, and compares the rest by value', () => {
    expect(holds(null, '')).toBe(true)
    expect(holds('Kante', 'Kante')).toBe(true)
    expect(holds('Kante', 'kante')).toBe(false)
    expect(holds({ id: 4 }, { id: 4 })).toBe(true)
    expect(holds(['A', 'B'], ['B', 'A'])).toBe(false)
    expect(holds(3, null)).toBe(false)
  })
})

describe('NEW_LINK', () => {
  it('finds links to rows the run creates, keys with colons included', () => {
    const found = [...'Von !blocks:new:b:r3-500! zu !routes:new:r4-1! und !routes:12!.'.matchAll(NEW_LINK)]
    expect(found.map((m) => [m[1], m[2]])).toEqual([
      ['blocks', 'b:r3-500'],
      ['routes', 'r4-1'],
    ])
  })
})

describe('grade labels', () => {
  it('maps the list label to grades.FB and back', () => {
    expect(fbLabel('6C+')).toBe('FB 6C+')
    expect(planLabel('FB 6C+')).toBe('6C+')
    expect(planLabel('FB 4')).toBe('4')
    expect(planLabel(null)).toBeNull()
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
