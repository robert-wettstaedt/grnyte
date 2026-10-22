import { render, screen } from '@testing-library/svelte'
import { expect, it, vi } from 'vitest'
import Page from './+page.svelte'

type Region = { id: number; name: string }
const preview = vi.hoisted(() => ({
  blocks: [] as Region[],
  deletes: [] as Region[],
  failed: false,
}))

vi.mock('../../account.remote', () => ({
  accountDeletionPreview: () =>
    preview.failed
      ? { current: undefined, error: new Error('down'), ready: false }
      : { current: preview, error: undefined, ready: true },
  deleteAccountCommand: vi.fn(),
}))
vi.mock('$lib/state/motion.svelte', () => ({ motion: () => 0, prefersStill: () => true }))
vi.mock('$lib/state/online.svelte', () => ({ isOnline: () => true }))
vi.mock('$lib/state/push.svelte', () => ({ disablePush: vi.fn() }))
vi.mock('$lib/state/wipe', () => ({ wipeAndLeave: vi.fn() }))
// jsdom has no ResizeObserver; nothing here depends on a measured size.
vi.stubGlobal(
  'ResizeObserver',
  class {
    disconnect() {}
    observe() {}
    unobserve() {}
  },
)
vi.stubGlobal('matchMedia', () => ({ addEventListener() {}, matches: false, removeEventListener() {} }))

const submitButton = () => screen.getByRole('button', { name: 'Delete my account' })

it('names a region that blocks the deletion, and will not submit while it does', () => {
  preview.blocks = [{ id: 1, name: 'Harz' }]
  preview.deletes = []
  render(Page)

  expect(screen.getByText('Harz')).toBeTruthy()
  expect(submitButton().hasAttribute('disabled')).toBe(true)
})

it('warns which regions go with the account, and lets the deletion through', () => {
  preview.blocks = []
  preview.deletes = [{ id: 2, name: 'Elbsandstein' }]
  render(Page)

  expect(screen.getByText('Elbsandstein')).toBeTruthy()
  expect(submitButton().hasAttribute('disabled')).toBe(false)
})

it('lists two regions that share a name, since names are not unique', () => {
  preview.blocks = []
  preview.deletes = [
    { id: 3, name: 'Elbsandstein' },
    { id: 4, name: 'Elbsandstein' },
  ]
  render(Page)

  expect(screen.getAllByText('Elbsandstein')).toHaveLength(2)
})

it('says the check failed and holds the deletion, since a region that goes is never confirmed', () => {
  preview.failed = true
  render(Page)

  expect(screen.getByRole('alert')).toBeTruthy()
  expect(submitButton().hasAttribute('disabled')).toBe(true)
  preview.failed = false
})
