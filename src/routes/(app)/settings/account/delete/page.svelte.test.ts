import { confirmWithCode, resetReauthRemote, submitNeedingConfirmation } from '$lib/auth/reauth.fixture'
import { formError } from '$lib/forms/schemas'
import { settle } from '$lib/forms/screen.fixture'
import { fireEvent, render, screen } from '@testing-library/svelte'
import { beforeEach, expect, it, vi } from 'vitest'
import Page from './+page.svelte'

type Region = { id: number; name: string }
const preview = vi.hoisted(() => ({
  blocks: [] as Region[],
  deletes: [] as Region[],
  failed: false,
}))
const command = vi.hoisted(() => vi.fn(async (_: unknown) => {}))

vi.mock('../../account.remote', () => ({
  accountDeletionPreview: () =>
    preview.failed
      ? { current: undefined, error: new Error('down'), ready: false }
      : { current: preview, error: undefined, ready: true },
  deleteAccountCommand: command,
}))
vi.mock('$lib/auth/reauth.remote', async () => (await import('$lib/auth/reauth.fixture')).reauthRemote)
vi.mock('$lib/state/push.svelte', () => ({ disablePush: vi.fn(async () => {}) }))
vi.mock('$lib/state/wipe', () => ({ wipeAndLeave: vi.fn() }))

const submitButton = () => screen.getByRole('button', { name: 'Delete my account' })

beforeEach(() => {
  preview.blocks = []
  preview.deletes = []
  preview.failed = false
  command.mockClear()
  resetReauthRemote(false)
})

it('names a region that blocks the deletion, offers no code, and will not submit while it does', async () => {
  preview.blocks = [{ id: 1, name: 'Harz' }]
  render(Page)
  await settle()

  expect(screen.getByText('Harz')).toBeTruthy()
  expect(screen.getByText('Hand over the regions below first')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Send code' })).toBeNull()
  expect(submitButton().hasAttribute('disabled')).toBe(true)
})

it('warns which regions go with the account, and lets a confirmed deletion through', async () => {
  resetReauthRemote(true)
  preview.deletes = [{ id: 2, name: 'Elbsandstein' }]
  render(Page)
  await settle()

  expect(screen.getByText('Elbsandstein')).toBeTruthy()
  expect(submitButton().hasAttribute('disabled')).toBe(false)
})

it('lists two regions that share a name, since names are not unique', () => {
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
})

it('deletes nothing on a correct code, only on the submit', async () => {
  render(Page)
  await settle()
  await confirmWithCode()

  expect(command).not.toHaveBeenCalled()
  await fireEvent.click(submitButton())
  await settle()
  expect(command).toHaveBeenCalledOnce()
})

it('opens code entry when the deletion answers that it needs a confirmation', async () => {
  resetReauthRemote(true)
  command.mockRejectedValueOnce({ body: { field: 'code', message: formError('auth_reauthRequired') } })
  render(Page)

  await submitNeedingConfirmation(submitButton())
})
