import { eventCard } from '$lib/entities/event/card'
import { EVENT_CASES } from '$lib/entities/event/cases/index'
import { ME } from '$lib/entities/event/cases/world'
import { groupEvents } from '$lib/entities/event/grouping'
import { fireEvent, render } from '@testing-library/svelte'
import { expect, it, vi } from 'vitest'
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
