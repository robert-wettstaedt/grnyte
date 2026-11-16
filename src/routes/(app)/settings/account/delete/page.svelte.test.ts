import { confirmWithCode, methods, resetReauthRemote, submitNeedingConfirmation } from '$lib/auth/reauth/reauth.fixture'
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
vi.mock('$lib/auth/reauth/reauth.remote', async () => (await import('$lib/auth/reauth/reauth.fixture')).reauthRemote)
vi.mock(
  '$lib/auth/methods/identities.remote',
  async () => (await import('$lib/auth/reauth/reauth.fixture')).identitiesRemote,
)
vi.mock('$lib/state/push.svelte', () => ({ disablePush: vi.fn(async () => {}) }))
vi.mock('$lib/state/wipe', () => ({ setLeaving: vi.fn(), wipeAndLeave: vi.fn() }))

const submitButton = () => screen.getByRole('button', { name: 'Delete' })

beforeEach(() => {
  preview.blocks = []
  preview.deletes = []
  preview.failed = false
  command.mockClear()
  resetReauthRemote(false)
})

it('names each region that blocks the deletion with a way to hand it over, offers no code, and will not submit', async () => {
  preview.blocks = [
    { id: 1, name: 'Harz' },
    { id: 5, name: 'Hoher Fels' },
  ]
  render(Page)
  await settle()

  expect(screen.getByText('Hand over your regions first')).toBeTruthy()
  expect(screen.getByText('You own Harz and Hoher Fels. Make another admin the owner there first.')).toBeTruthy()
  const links = screen.getAllByRole('link', { name: 'Hand over' }).map((link) => link.getAttribute('href'))
  expect(links).toEqual(['/regions/1', '/regions/5'])
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
  expect(screen.getByText('Press Delete to delete your account.')).toBeTruthy()

  expect(command).not.toHaveBeenCalled()
  await fireEvent.click(submitButton())
  await settle()
  expect(command).toHaveBeenCalledOnce()
})

it.each([
  [true, ['apple', 'google'], true],
  [false, ['apple', 'google'], false],
  [true, ['google'], false],
])('offers Confirm with Apple (linked %s, configured %j): %s', async (linked, configured, shown) => {
  Object.assign(methods, { apple: linked, configured })
  render(Page)
  await settle()

  expect(screen.queryByRole('button', { name: 'Confirm with Apple' }) != null).toBe(shown)
  expect(screen.getByRole('button', { name: 'Send code' })).toBeTruthy()
})

it('settles with no alternative when the sign-in methods cannot be read', async () => {
  methods.failed = true
  render(Page)
  await settle()

  expect(screen.getByRole('button', { name: 'Send code' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Confirm with Apple' })).toBeNull()
})

it('opens code entry when the deletion answers that it needs a confirmation', async () => {
  resetReauthRemote(true)
  command.mockRejectedValueOnce({ body: { field: 'code', message: formError('auth_reauthRequired') } })
  render(Page)

  await submitNeedingConfirmation(submitButton())
})
