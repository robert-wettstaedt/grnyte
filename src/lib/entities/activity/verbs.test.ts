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
import { describe, expect, it } from 'vitest'
import { activityFields } from './fields'
import { ACTIVITY_VERBS, activityVerb, type ActivityVerb } from './verbs'

describe('ACTIVITY_VERBS', () => {
  it('lists exactly the ascent types the enum defines', () => {
    const written = ACTIVITY_VERBS.filter((verb) => verb.entityType === 'ascent' && verb.type === 'created').map(
      (verb) => verb.newValue,
    )

    // Both directions: a renamed value leaves a card pointing at a dead message key, and a
    // new one added to the enum silently gets no card at all.
    expect([...written].sort()).toEqual([...ascentTypeEnum].sort())
  })

  it('has a field registry entry for every column it writes', () => {
    const missing = [...new Set(ACTIVITY_VERBS.map((verb) => verb.columnName))]
      .filter((columnName) => columnName != null)
      .filter((columnName) => activityFields[columnName] == null)

    expect(missing).toEqual([])
  })

  it('writes every column the field registry knows about', () => {
    // The other direction: a registry entry nothing writes is a label, an icon and a diff
    // renderer maintained in two locales for a card that can never appear.
    const written = new Set(ACTIVITY_VERBS.map((verb) => verb.columnName))
    const unused = Object.keys(activityFields).filter((columnName) => !written.has(columnName))

    expect(unused).toEqual([])
  })

  it('resolves every entry to its own key', () => {
    // Two entries that compose the same lookup id would leave one of them unreachable, with
    // the other's sentence quietly standing in for it.
    const shadowed = ACTIVITY_VERBS.filter((verb) => activityVerb(verb) !== verb.key)

    expect(shadowed).toEqual([])
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
