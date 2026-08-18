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
      overflowCount: view.overflowCount,
      pin: view.pin != null,
      /**
       * Each row, and what hangs off it.
       *
       * The opinion strip and the note are per row now, so a session of five ascents carries five
       * of each. Read as text so the wall stays diffable: a grade is its stored id (the label
       * needs the reader's scale), stars are stars, and a note is quoted whole, since a card that
       * attributes one climber's words to another climber's row is the failure worth seeing.
       */
      rows: view.rows.map((row) => {
        const strip = [
          row.ascent?.gradeFk == null ? undefined : `grade ${row.ascent.gradeFk}`,
          // Above zero, the way the card narrows it: a cleared rating is stored as 0 and draws
          // no stars, so printing "0 stars" would claim a strip the card does not render.
          row.ascent?.rating == null || row.ascent.rating === 0 ? undefined : `${row.ascent.rating} stars`,
          row.ascent?.temperature == null ? undefined : `${row.ascent.temperature} C`,
          row.ascent?.humidity == null ? undefined : `${row.ascent.humidity}%`,
          row.note == null ? undefined : `"${row.note}"`,
        ].filter((part) => part != null)

        const name = `${row.state}:${row.entity?.name ?? row.name ?? '(gone)'}`
        return strip.length === 0 ? name : `${name} (${strip.join(', ')})`
      }),
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
