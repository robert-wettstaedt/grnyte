import { toDisplayName } from '$lib/entities/displayName'
import { eventCard } from '$lib/entities/event/card'
import { EVENT_CASES } from '$lib/entities/event/cases/index'
import { ME } from '$lib/entities/event/cases/world'
import { groupEvents } from '$lib/entities/event/grouping'
import { setLocale } from '$lib/paraglide/runtime'
import { fireEvent, render } from '@testing-library/svelte'
import { expect, it, onTestFinished, vi } from 'vitest'
import EventCard from './EventCard.svelte'

vi.mock('$lib/state/global.svelte', () => ({
  getGlobalState: () => ({ grades: [], gradingScale: 'FB', user: undefined }),
}))
// jsdom has no matchMedia.
vi.mock('$lib/state/motion.svelte', () => ({ motion: () => 0, prefersStill: () => true }))
vi.mock('$lib/components/Reactions/Reactions.svelte', () => ({ default: () => {} }))

const view = EVENT_CASES.flatMap((entry) =>
  groupEvents(entry.events).map((group) => eventCard(group, entry.reader ?? ME, entry.topos)),
).find((card) => card.changes.length > 0)

// The event page passes no `onToggle`; an optional call there once skipped the flip itself.
it('opens its changes without an onToggle', async () => {
  const { getByRole } = render(EventCard, { view: view! })
  const toggle = getByRole('button', { expanded: false })

  await fireEvent.click(toggle)

  expect(toggle.getAttribute('aria-expanded')).toBe('true')
})

// Someone else's card, so the headline names its actor rather than saying "You".
const theirs = EVENT_CASES.flatMap((entry) =>
  groupEvents(entry.events).map((group) => eventCard(group, entry.reader ?? ME, entry.topos)),
).find((card) => !card.mine)

it('credits a deleted actor without a face or a link to lead to', () => {
  const { container, getByText } = render(EventCard, {
    view: { ...theirs!, actorFk: null, actorName: 'Deleted user' },
  })

  expect(getByText('Deleted user')).toBeTruthy()
  expect(container.querySelector('a[href^="/users/"]')).toBeNull()
})

const projectCard = (days: number) => ({
  view: {
    ...theirs!,
    accolade: { accolade: { days, kind: 'project' as const, sessions: 17 }, name: toDisplayName('Foobar') },
  },
})

it.each([
  [60, 'over 60 days'],
  [61, 'over 2 months'],
  [90, 'over 3 months'],
  [350, 'over 11 months'],
  [351, 'over 1 year'],
  [365, 'over 1 year'],
  [547, 'over 1.5 years'],
  [729, 'over 2 years'],
  [946, 'over 2.5 years'],
])('states a project of %i days as %s', (days, span) => {
  const { getByText } = render(EventCard, projectCard(days))

  expect(getByText(`Project Foobar sent, 17 sessions ${span}`)).toBeTruthy()
})

it('formats half years for the reader, in their language', () => {
  setLocale('de', { reload: false })
  onTestFinished(() => setLocale('en', { reload: false }))

  const { getByText } = render(EventCard, projectCard(946))

  expect(getByText('Projekt Foobar durchgestiegen, 17 Sessions über 2,5 Jahre')).toBeTruthy()
})
