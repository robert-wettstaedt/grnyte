import { page } from '$app/state'
import { fireEvent, render, screen } from '@testing-library/svelte'
import { beforeEach, expect, it, vi } from 'vitest'
import Page from './+page.svelte'

const writes = vi.hoisted(() => ({ deleteRoute: vi.fn(async () => ({})) }))
const undo = vi.hoisted(() => ({ notifyUndo: vi.fn(), undoRemoval: vi.fn(async () => ({})) }))
const preview = vi.hoisted(() => ({ error: undefined as unknown, ready: true }))

vi.mock('$app/state', () => ({
  page: { params: { id: '5', kind: 'route' }, url: new URL('http://localhost/remove/route/5') },
}))
vi.mock('$app/navigation', () => ({ afterNavigate: () => {}, beforeNavigate: () => {}, goto: async () => {} }))
vi.mock('$lib/entities/moderation/moderation.remote', () => ({
  removalPreview: () => ({
    current: preview.ready
      ? { item: { body: 'Gym ad', home: '/routes/5', parentFk: 2, title: 'Odin' }, names: ['Ada'], others: 2 }
      : undefined,
    error: preview.error,
    ready: preview.ready,
  }),
}))
vi.mock('$lib/entities/route/writes', () => writes)
vi.mock('$lib/entities/moderation/writes', () => ({ undoRemoval: undo.undoRemoval }))
vi.mock('$lib/state/toast', async (original) => ({
  ...(await original<typeof import('$lib/state/toast')>()),
  notifyUndo: undo.notifyUndo,
}))
vi.mock('$lib/components/Markdown/Markdown.svelte', () => ({ default: () => {} }))
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
Element.prototype.scrollIntoView = () => {}

const submitButton = () => screen.getByRole('button', { name: 'Remove and notify' })
const removeAsSpam = async () => {
  await fireEvent.click(screen.getByLabelText('Spam or advertising'))
  await fireEvent.input(screen.getByRole('textbox', { name: /^Reason/ }), { target: { value: 'Advertising a gym' } })
  await fireEvent.click(submitButton())
}

beforeEach(() => {
  Object.assign(page, { params: { id: '5', kind: 'route' } })
  preview.ready = true
  preview.error = undefined
  writes.deleteRoute.mockClear()
})

it('shows what goes and who is told before it can be submitted', () => {
  render(Page)

  expect(screen.getByText('Odin')).toBeTruthy()
  expect(screen.getByText('Ada and 2 more will be told why, and can appeal.')).toBeTruthy()
  expect(submitButton().hasAttribute('disabled')).toBe(false)
})

it('says why it refuses, instead of that loading failed', async () => {
  preview.ready = false
  preview.error = { body: { message: JSON.stringify({ message: 'moderation_nothingOfOthers' }) }, status: 400 }
  render(Page)

  expect(await screen.findByText(/Nothing here was added by another member/)).toBeTruthy()
})

it('holds the submit until it knows who will be told', () => {
  preview.ready = false
  render(Page)

  expect(submitButton().hasAttribute('disabled')).toBe(true)
})

it('refuses a removal without a reason on the reason field, and removes nothing', async () => {
  render(Page)

  await fireEvent.click(screen.getByLabelText('Spam or advertising'))
  await fireEvent.input(screen.getByRole('textbox', { name: /^Reason/ }), { target: { value: '   ' } })
  await fireEvent.click(submitButton())

  expect(screen.getByRole('textbox', { name: /^Reason/ }).getAttribute('aria-invalid')).toBe('true')
  expect(writes.deleteRoute).not.toHaveBeenCalled()
})

it('removes the route with its ground and reason', async () => {
  render(Page)

  await removeAsSpam()

  expect(writes.deleteRoute).toHaveBeenCalledWith(
    { blockFk: 2, id: 5 },
    { ground: 'spam', reason: 'Advertising a gym' },
  )
})

it('offers an Undo that takes the removal back', async () => {
  render(Page)

  await removeAsSpam()
  await vi.waitFor(() => expect(undo.notifyUndo).toHaveBeenCalled())
  // The submit has left the page by now, so the route's params no longer name what was removed.
  Object.assign(page, { params: {} })
  const [{ onUndo }] = undo.notifyUndo.mock.calls.at(-1) as unknown as [{ onUndo: () => Promise<unknown> }]
  await onUndo()

  expect(undo.undoRemoval).toHaveBeenCalledWith('route', '5')
})
