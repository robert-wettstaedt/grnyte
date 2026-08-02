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
import { ACTIVITY_VERBS, activityVerb, WRITTEN_ACTIVITIES, type ActivityVerb } from './verbs'

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
    // The `{:else}` arm is the plain old/new pair, so `text` needs no branch of its own.
    const implemented = new Set(['text', ...[...source.matchAll(/renderer === '(\w+)'/g)].map(([, name]) => name)])
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
