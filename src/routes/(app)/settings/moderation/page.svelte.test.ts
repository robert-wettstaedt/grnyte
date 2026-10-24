import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte'
import { beforeEach, expect, it, vi } from 'vitest'
import Page from './+page.svelte'

const remote = vi.hoisted(() => ({
  current: [
    {
      actorName: 'Cy',
      createdAt: Date.now(),
      ground: 'spam',
      id: 7,
      items: [{ kind: 'comment', name: 'Gym ad' }],
      objectId: '42',
      objectType: 'comment',
      reason: 'Advertising a gym',
      regionName: 'North',
      reversedAt: undefined,
    },
  ],
  error: undefined,
  ready: true,
  refresh: vi.fn(async () => {}),
}))
const writes = vi.hoisted(() => ({ undoRemoval: vi.fn(async () => ({})) }))

vi.mock('$lib/entities/moderation/moderation.remote', () => ({ listDecisions: () => remote }))
vi.mock('$lib/entities/moderation/writes', () => writes)
vi.mock('$lib/state/motion.svelte', () => ({ motion: () => 0, prefersStill: () => true }))
vi.mock('$lib/state/online.svelte', () => ({ isOnline: () => true }))
vi.stubGlobal(
  'ResizeObserver',
  class {
    disconnect() {}
    observe() {}
    unobserve() {}
  },
)
vi.stubGlobal('matchMedia', () => ({ addEventListener() {}, matches: false, removeEventListener() {} }))

const undoTheRow = async () => {
  render(Page)
  await fireEvent.click(screen.getByText('Spam or advertising'))
  await fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
  await fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Undo' }))
}

beforeEach(() => {
  remote.refresh.mockClear()
})

it('undoes the row s own object, then refreshes the list', async () => {
  await undoTheRow()

  await waitFor(() => expect(remote.refresh).toHaveBeenCalled())
  expect(writes.undoRemoval).toHaveBeenCalledWith('comment', '42', 7)
})

// Another admin undid it first: the stale row must not keep offering an Undo that cannot succeed.
it('refreshes the list after a refused undo too', async () => {
  writes.undoRemoval.mockRejectedValueOnce({ body: { message: 'moderation_notFound' } })
  await undoTheRow()

  await waitFor(() => expect(remote.refresh).toHaveBeenCalled())
})
