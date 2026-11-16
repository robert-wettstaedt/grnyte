import { confirmWithCode, enterCode, reauthRemote, resetReauthRemote } from '$lib/auth/reauth.fixture'
import { formError } from '$lib/forms/schemas'
import { settle } from '$lib/forms/screen.fixture'
import { fireEvent, render, screen } from '@testing-library/svelte'
import { beforeEach, expect, it, vi } from 'vitest'
import Page from './+page.svelte'

const command = vi.hoisted(() => vi.fn(async (_: unknown) => ({ redirectTo: '/settings', success: true })))

vi.mock('../account.remote', () => ({ updatePasswordCommand: command }))
vi.mock('$lib/auth/reauth.remote', async () => (await import('$lib/auth/reauth.fixture')).reauthRemote)
vi.mock('$lib/state/navigation.svelte', async (original) => ({ ...(await original<object>()), exit: vi.fn() }))

const saveButton = () => screen.getByRole('button', { name: 'Save' })
const newPassword = () => screen.queryByLabelText('New password') as HTMLInputElement | null
const NEW = 'a-new-Passw0rd!'

beforeEach(() => {
  command.mockClear()
  resetReauthRemote(false)
})

it('shows the new-password field only once confirmed, and changes nothing on the code', async () => {
  render(Page)
  await settle()
  expect(newPassword()).toBeNull()
  expect(saveButton().hasAttribute('disabled')).toBe(true)

  await confirmWithCode()
  expect(newPassword()).toBeTruthy()
  expect(command).not.toHaveBeenCalled()

  await fireEvent.input(newPassword()!, { target: { value: NEW } })
  await fireEvent.click(saveButton())
  await settle()
  expect(command).toHaveBeenCalledWith({ password: NEW })
})

it('opens code entry when the change needs a fresh confirmation, keeping the typed password', async () => {
  resetReauthRemote(true)
  command.mockRejectedValueOnce({ body: { field: 'code', message: formError('auth_reauthRequired') } })
  render(Page)
  await settle()
  await fireEvent.input(newPassword()!, { target: { value: NEW } })
  await fireEvent.click(saveButton())
  await settle()

  expect(reauthRemote.requestReauthCode).toHaveBeenCalledOnce()
  expect(newPassword()).toBeNull()
  await enterCode('123456')
  expect(newPassword()!.value).toBe(NEW)
})
