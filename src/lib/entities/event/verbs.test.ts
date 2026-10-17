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
import { REFINABLE, verbKey, VERBS, WRITTEN_ROWS, type VerbEntry } from './verbs'

describe('REFINABLE', () => {
  it('lets an update fold into exactly add, create and update', () => {
    // Pinned as a literal: the event-log test reads the set, so only this catches it WIDENING,
    // which would let change rows sit under a delete or remove.
    expect([...REFINABLE].sort()).toEqual(['add', 'create', 'update'])
  })
})

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
          decoded: { kind: 'none' },
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
