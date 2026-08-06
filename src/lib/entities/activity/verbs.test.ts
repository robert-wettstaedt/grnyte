/**
 * `verbs.ts` mirrors the mutation layer by hand, so it can only drift silently. The message
 * keys themselves are covered by `tsc` (they are `MessageKey` literals), and so are
 * `entityType` and `type`. These are the guards for the two string fields that carry meaning
 * and nothing checks: the ascent type an `ascent created` row stores in `newValue`, and
 * `columnName`.
 *
 * The first one exists because it already failed once, unnoticed: renaming the ascent type
 * `send` to `redpoint` left the catalogue on the old value, so the feed would have looked up
 * `activity_ascentCreatedSend`, a key that no longer exists.
 */
import { ascentTypeEnum } from '$lib/db/schema'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  ACTIVITY_VERBS,
  activityVerb,
  parseDeletedAscent,
  parseDeletionScale,
  stringifyDeletedAscent,
  WRITTEN_ACTIVITIES,
  type ActivityVerb,
} from './verbs'

// The catalogue is `as const`, so its element type is a union in which only some members
// declare `columnName` or `newValue`. Reads of those two go through `WRITTEN_ACTIVITIES`,
// which is the same rows widened to `Partial<ActivityListItem>`.
describe('ACTIVITY_VERBS', () => {
  it('lists exactly the ascent types the enum defines', () => {
    const written = WRITTEN_ACTIVITIES.filter((verb) => verb.entityType === 'ascent' && verb.type === 'created').map(
      (verb) => verb.newValue,
    )

    // Both directions: a renamed value leaves a card pointing at a dead message key, and a
    // new one added to the enum silently gets no card at all.
    expect([...written].sort()).toEqual([...ascentTypeEnum].sort())
  })

  // Read off the component rather than restated here, so this cannot become the second place
  // that knows which renderers exist. `'user'` was declared by four entries for months with
  // no branch implementing it, and every one of them silently rendered as plain text.
  it('declares only renderers ActivityChanges implements', () => {
    const source = readFileSync('src/lib/components/ActivityFeed/ActivityChanges.svelte', 'utf8')
    // Two ways to be implemented: a branch of your own, or an entry in `FORMATTERS`, which the
    // `{:else}` arm reads before rendering the plain pair. `text` IS that plain pair, so it
    // needs neither.
    const formatters = /const FORMATTERS[^{]*\{([\s\S]*?)\n {2}\}/.exec(source)?.[1] ?? ''
    const implemented = new Set([
      'text',
      ...[...source.matchAll(/renderer === '(\w+)'/g)].map(([, name]) => name),
      ...[...formatters.matchAll(/^ {4}(\w+):/gm)].map(([, name]) => name),
    ])

    // The regex above is the load-bearing half of this test: if it stops finding the map, every
    // renderer it covers silently looks unimplemented (or, worse, the set looks complete for
    // the wrong reason).
    expect([...implemented]).toEqual(expect.arrayContaining(['date', 'humidity', 'role', 'temperature']))
    const declared = [...new Set(ACTIVITY_VERBS.flatMap((verb) => ('field' in verb ? [verb.field.renderer] : [])))]

    expect(declared.filter((renderer) => !implemented.has(renderer))).toEqual([])
  })

  it('resolves every entry to its own key', () => {
    // Two entries that compose the same lookup id would leave one of them unreachable, with
    // the other's sentence quietly standing in for it.
    const shadowed = ACTIVITY_VERBS.filter((verb) => activityVerb(verb) !== verb.key)

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

describe('activityVerb', () => {
  const activity = (partial: Partial<Omit<ActivityVerb, 'key'>>): Omit<ActivityVerb, 'key'> => ({
    entityType: 'route',
    type: 'updated',
    ...partial,
  })

  it('degrades an unwritten update column to the entity verb', () => {
    // Vaguer, but still true: something about the route changed.
    expect(activityVerb(activity({ columnName: 'retired' }))).toBe('activity_routeUpdated')
  })

  it('never degrades a delete to "deleted the entity"', () => {
    // `favorite` deletes are legacy rows: no mutation writes them today. Degrading one to
    // `activity_routeDeleted` would claim a route that is still there is gone.
    expect(activityVerb(activity({ columnName: 'favorite', type: 'deleted' }))).toBe('activity_genericChange')
  })

  it('falls back to the generic verb when the entity has no vaguer one either', () => {
    expect(activityVerb(activity({ columnName: 'role', entityType: 'user', type: 'created' }))).toBe(
      'activity_genericChange',
    )
  })
})
