/**
 * `written.ts` mirrors the mutation layer by hand, so it can only drift silently. TypeScript
 * covers `entityType` and `type` (both come off `ActivityDto`), but not the two string fields
 * that carry meaning: the ascent type an `ascent created` row stores in `newValue`, and
 * `columnName`. These are the guards for those.
 *
 * The first one exists because it already failed once, unnoticed: renaming the ascent type
 * `send` to `redpoint` left this list on the old value, so the feed would have looked up
 * `activity_ascentCreatedSend`, a key that no longer exists.
 */
import { ascentTypeEnum } from '$lib/db/schema'
import { describe, expect, it } from 'vitest'
import { activityFields } from './fields'
import { WRITTEN_ACTIVITIES } from './written'

describe('WRITTEN_ACTIVITIES', () => {
  it('lists exactly the ascent types the enum defines', () => {
    const written = WRITTEN_ACTIVITIES.filter(
      (activity) => activity.entityType === 'ascent' && activity.type === 'created',
    ).map((activity) => activity.newValue)

    // Both directions: a renamed value leaves a card pointing at a dead message key, and a
    // new one added to the enum silently gets no card at all.
    expect([...written].sort()).toEqual([...ascentTypeEnum].sort())
  })

  it('has a field registry entry for every column it writes', () => {
    const missing = [...new Set(WRITTEN_ACTIVITIES.map((activity) => activity.columnName))]
      .filter((columnName) => columnName != null)
      .filter((columnName) => activityFields[columnName] == null)

    expect(missing).toEqual([])
  })

  it('writes every column the field registry knows about', () => {
    // The other direction: a registry entry nothing writes is a label, an icon and a diff
    // renderer maintained in two locales for a card that can never appear.
    const written = new Set(WRITTEN_ACTIVITIES.map((activity) => activity.columnName))
    const unused = Object.keys(activityFields).filter((columnName) => !written.has(columnName))

    expect(unused).toEqual([])
  })
})
