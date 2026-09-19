/**
 * `verbs.ts` mirrors the mutation layer by hand, so it can only drift silently. The message
 * keys themselves are covered by `tsc` (they are `MessageKey` literals), and so are
 * `entityType` and `type`. These are the guards for the two string fields that carry meaning
 * and nothing checks: the ascent type an `ascent created` row stores in `newValue`, and
 * `columnName`.
 *
 * The first one exists because it already failed once, unnoticed: renaming the ascent type
 * `send` to `redpoint` left the catalogue on the old value, so the feed would have looked up
 * `activity_ascentCreatedSend`, the key it was called before that rename (see 0093).
 */
import { ascentTypeEnum } from '$lib/db/schema'
import { describe, expect, it } from 'vitest'
import { changeViews } from './change'
import { line } from './line.fixture'
import {
  parseDeletedAscent,
  parseDeletionScale,
  stringifyDeletedAscent,
  verbKey,
  VERBS,
  WRITTEN_ROWS,
  type VerbEntry,
} from './verbs'

// The catalogue is `as const`, so its element type is a union in which only some members declare
// `columnName` or `value`. Reads of those two go through `WRITTEN_ROWS`, the same entries widened
// to `Partial<VerbEntry>`.
describe('VERBS', () => {
  it('lists exactly the ascent types the enum defines', () => {
    const written = WRITTEN_ROWS.filter((entry) => entry.objectType === 'ascent' && entry.verb === 'create').map(
      (entry) => entry.value,
    )

    // Both directions: a renamed value leaves a card pointing at a dead message key, and a
    // new one added to the enum silently gets no card at all.
    expect([...written].sort()).toEqual([...ascentTypeEnum].sort())
  })

  /**
   * Every declared kind decodes into a view of that kind.
   *
   * This replaces a test that read `EventChanges.svelte` as text and regex-matched its
   * branches, because that was the only way to ask whether a declared renderer was implemented
   * at all: `'user'` was declared by four entries for months with no branch, and every one of
   * them silently rendered as plain text. Now the kinds are a union, `changeViews` switches
   * on it exhaustively (so a missing arm is a `tsc` error) and the markup narrows on the view,
   * so what is left to check is that the catalogue's own entries round-trip.
   */
  it('decodes every declared field kind', () => {
    // Widened first, like `WRITTEN_ROWS`: only some `as const` members declare
    // `columnName`, and a union cannot be read on a key its every member does not have.
    const fields = (VERBS as readonly VerbEntry[]).flatMap((verb) =>
      verb.field == null ? [] : [{ ...verb, field: verb.field }],
    )
    const kinds = new Set(fields.map((verb) => verb.field.kind))

    // Only the pairs may carry a format, and every pair must: `undefined` would fall back to
    // plain text and quietly stop localising a date or a role.
    expect(
      fields.filter((verb) => (verb.field.kind === 'pair') !== (verb.field.format != null)).map((verb) => verb.key),
    ).toEqual([])

    // Only a location may declare itself cleared; on anything else the flag does nothing.
    expect(
      fields.filter((verb) => verb.field.cleared != null && verb.field.kind !== 'location').map((verb) => verb.key),
    ).toEqual([])

    const decoded = fields.map((verb) => {
      const [change] = changeViews([
        {
          actorFk: 1,
          actorName: 'ada',
          cleared: false,
          columnName: verb.columnName,
          createdAt: 0,
          id: 1,
          metadata: undefined,
          newValue: undefined,
          objectId: '1',
          objectType: verb.objectType,
          oldValue: undefined,
          parentId: undefined,
          parentType: undefined,
          regionFk: 1,
          value: verb.value,
          verb: verb.verb,
        },
      ])

      return { key: verb.key, kind: change?.kind }
    })

    expect(decoded.filter((entry) => entry.kind == null)).toEqual([])
    expect([...new Set(decoded.map((entry) => entry.kind))].sort()).toEqual([...kinds].sort())
  })

  it('resolves every entry to its own key', () => {
    // Two entries that compose the same lookup id would leave one of them unreachable, with
    // the other's sentence quietly standing in for it.
    const shadowed = VERBS.filter((verb) => verbKey(verb) !== verb.key)

    expect(shadowed).toEqual([])
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

describe('verbKey', () => {
  it('degrades an unwritten update column to the entity verb', () => {
    // Vaguer, but still true: something about the route changed.
    expect(verbKey(line({ columnName: 'retired' }))).toBe('event_routeUpdated')
  })

  it('never degrades a delete to "deleted the entity"', () => {
    // `favorite` deletes are legacy rows: no mutation writes them today. Degrading one to
    // `event_routeDeleted` would claim a route that is still there is gone.
    expect(verbKey(line({ columnName: 'favorite', verb: 'delete' }))).toBe('event_genericChange')
  })

  it('falls back to the generic verb when the entity has no vaguer one either', () => {
    expect(verbKey(line({ columnName: 'role', objectType: 'user', verb: 'create' }))).toBe('event_genericChange')
  })
})
