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
      changes: view.changes.map((change) => resolveMessage(change.field.labelKey, { media: 'none' })),
      headline: resolveMessage(view.headline.key, {
        ...view.headline.params,
        actor: view.actorName,
        climber: view.climberName ?? '',
        name: view.entityName ?? '?',
      }),
      rows: view.rows.map((row) => row.entity?.name ?? row.name ?? '(gone)'),
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
