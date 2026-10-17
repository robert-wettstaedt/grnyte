import { parseTopoChange } from '$lib/entities/topo/change'
import { parseCoords } from '$lib/map/coords'
import { describe, expect, it } from 'vitest'
import { EVENT_CASES } from './cases/index'
import {
  decodeMetadata,
  parseDeletedAscent,
  parseDeletionScale,
  stringifyDeletedAscent,
  type EventMetadata,
} from './metadata'

const PARSERS = {
  coords: parseCoords,
  deletedAscent: parseDeletedAscent,
  deletionScale: parseDeletionScale,
  topo: parseTopoChange,
} as const

const payload = (decoded: EventMetadata) =>
  'coords' in decoded
    ? decoded.coords
    : 'change' in decoded
      ? decoded.change
      : 'climber' in decoded
        ? decoded.climber
        : 'scale' in decoded
          ? decoded.scale
          : undefined

const EDGES = [
  undefined,
  '',
  ' ',
  '~',
  ',',
  '~47.123456,8.567890',
  '47.123456,8.567890',
  '1,2',
  'not json',
  '{',
  '[1,2]',
  '5',
  'null',
  '"text"',
  '{}',
  '{"action":"bogus"}',
  '{"action":"lines"}',
  '{"routes":0}',
  '{"climberFk":7}',
  'ada@example.com',
  'Ada Rossi',
]

describe('decodeMetadata', () => {
  const corpus = [
    ...new Set([...EVENT_CASES.flatMap((entry) => entry.events.map((event) => event.metadata)), ...EDGES]),
  ]

  it.each(corpus)('agrees with every parser on %j', (raw) => {
    const decoded = decodeMetadata(raw)
    const hits = Object.entries(PARSERS).filter(([, parse]) => parse(raw) != null)

    expect(hits.map(([kind]) => kind)).toEqual(decoded.kind in PARSERS ? [decoded.kind] : [])
    expect(payload(decoded)).toEqual(hits[0]?.[1](raw) ?? undefined)
    if (hits.length === 0) expect(decoded.kind).toBe(raw == null || raw === '' ? 'none' : 'text')
  })

  it('covers every encoding the catalogue writes', () => {
    expect(new Set(corpus.map((raw) => decodeMetadata(raw).kind))).toEqual(
      new Set(['coords', 'deletedAscent', 'deletionScale', 'none', 'text', 'topo']),
    )
  })
})

describe('parseDeletionScale', () => {
  it('reads the counts a deletion recorded', () => {
    expect(parseDeletionScale('{"blocks":3,"routes":42}')).toEqual({ areas: undefined, blocks: 3, routes: 42 })
  })

  it('answers nothing for metadata that is not a scale', () => {
    // A topo row's metadata sits in the same column, and rows written before scales existed
    // have none at all.
    expect(parseDeletionScale('{"action":"lines","topoId":1}')).toBeUndefined()
    expect(parseDeletionScale('not json')).toBeUndefined()
    expect(parseDeletionScale(undefined)).toBeUndefined()
  })

  it('drops a count that is not a number', () => {
    // The card sums these with `+=`, where a string concatenates instead of adding and turns
    // one deletion of 9 routes into "09 routes". JSON is not this code's to trust.
    expect(parseDeletionScale('{"routes":"9"}')).toBeUndefined()
    expect(parseDeletionScale('{"blocks":2,"routes":"9"}')).toEqual({
      areas: undefined,
      blocks: 2,
      routes: undefined,
    })
  })
})

describe('parseDeletedAscent', () => {
  it('round-trips what a deletion recorded', () => {
    const climber = { climberFk: 7, climberName: 'Ada Rossi' }

    expect(parseDeletedAscent(stringifyDeletedAscent(climber))).toEqual(climber)
  })

  it('answers nothing for the other things that share the column', () => {
    // Topo metadata is not JSON at all, a deletion scale is JSON without a climber in it, and
    // every ascent deleted before this shipped carries no metadata.
    expect(parseDeletedAscent('{"action":"lines","topoId":1}')).toBeUndefined()
    expect(parseDeletedAscent('{"routes":3}')).toBeUndefined()
    expect(parseDeletedAscent(undefined)).toBeUndefined()
  })

  it('refuses a half-recorded climber rather than naming nobody', () => {
    expect(parseDeletedAscent('{"climberFk":7}')).toBeUndefined()
    expect(parseDeletedAscent('{"climberName":"Ada Rossi"}')).toBeUndefined()
    expect(parseDeletedAscent('{"climberFk":"7","climberName":"Ada Rossi"}')).toBeUndefined()
  })
})
