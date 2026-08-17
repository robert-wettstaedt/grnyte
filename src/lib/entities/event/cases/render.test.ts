import { resolveMessage } from '$lib/i18n/message'
import { describe, expect, it } from 'vitest'
import { eventCard } from '../card'
import { groupEvents } from '../grouping'
import { EVENT_CASES } from './index'
import { ME } from './world'

/**
 * What every case actually renders, as one readable line per card.
 *
 * The snapshot is the review surface's twin: the Storybook wall shows the cards, this shows the
 * sentences they resolve, and a change to either shows up here. Resolved copy on purpose, unlike
 * the rest of the suite: a key tells you nothing about whether the sentence is the right one, and
 * being able to read the wall as text is what makes a diff reviewable.
 */
const render = (caseId: string) => {
  const entry = EVENT_CASES.find((item) => item.id === caseId)
  if (entry == null) {
    throw new Error(`no case ${caseId}`)
  }

  const reader = entry.reader ?? ME

  return groupEvents(entry.events).map((group) => {
    const view = eventCard(group, reader, entry.topos)

    return {
      // What the strip under the headline says a logged ascent recorded.
      ascent: view.ascent,
      /**
       * Every decided part of a change line, not only its label.
       *
       * The label alone was too little: two entries can share one and differ in the renderer they
       * declare, so swapping a "location set" field for a "location gone" field was invisible on
       * all 245 cards. `captionKey` is what a location or topo line actually reads out.
       */
      changes: view.changes.map((change) => ({
        after: 'after' in change ? change.after : undefined,
        before: 'before' in change ? change.before : undefined,
        caption:
          'captionKey' in change && change.captionKey != null
            ? // The params the component passes: a moved pin reads its distance, and a topo caption
              // borrows the media word a pulled photo uses. Passing neither rendered "Moved undefined".
              resolveMessage(change.captionKey, {
                distance: 'metres' in change && change.metres != null ? `${change.metres} m` : '',
                media: 'photo',
              })
            : undefined,
        kind: change.kind,
        // Through the line's OWN params, not a hardcoded word: `event_fieldFile` selects on
        // `media`, so passing 'none' rendered "Media" for every removal.
        label: resolveMessage(change.field.labelKey, change.labelParams),
      })),
      climbedAt: view.climbedAt != null,
      /** Missing for good, which reads differently from a name that is simply absent. */
      entityUnnamed: view.entityUnnamed,
      files: view.files.length,
      headline: resolveMessage(view.headline.key, {
        ...view.headline.params,
        actor: view.actorName,
        climber: view.climberName ?? '',
        name: view.entityName ?? '?',
      }),
      mine: view.mine,
      note: view.note,
      overflowCount: view.overflowCount,
      pin: view.pin != null,
      rows: view.rows.map((row) => `${row.state}:${row.entity?.name ?? row.name ?? '(gone)'}`),
      /** The ascent glyph, which four catalogue entries exist to set and nothing was asserting. */
      status: view.status,
      summary: (view.summary ?? []).map((part) =>
        part.key == null ? part.text : resolveMessage(part.key, part.params),
      ),
    }
  })
}

describe('the case catalogue renders what it claims', () => {
  for (const entry of EVENT_CASES) {
    it(`${entry.id}: ${entry.action}`, () => {
      expect({ cards: render(entry.id), expected: entry.expected }).toMatchSnapshot()
    })
  }
})
