import {
  confirmWithCode,
  enterCode,
  methods,
  reauthRemote,
  resetReauthRemote,
  submitNeedingConfirmationWithApple,
} from '$lib/auth/reauth.fixture'
import { formError } from '$lib/forms/schemas'
import { settle } from '$lib/forms/screen.fixture'
import { fireEvent, render, screen } from '@testing-library/svelte'
import { beforeEach, expect, it, vi } from 'vitest'
import Page from './+page.svelte'

const SESSION = { access_token: 'new.access.token', refresh_token: 'new-refresh' }
const command = vi.hoisted(() =>
  vi.fn(async (_: unknown) => ({
    redirectTo: '/settings',
    session: { access_token: 'new.access.token', refresh_token: 'new-refresh' },
    success: true,
  })),
)
const browser = vi.hoisted(() => ({ invalidate: vi.fn(async () => {}), setSession: vi.fn(async () => ({})) }))
vi.mock('$app/state', () => ({ page: { data: { supabase: { auth: { setSession: browser.setSession } } } } }))
vi.mock('$app/navigation', async (original) => ({ ...(await original<object>()), invalidate: browser.invalidate }))

vi.mock('../account.remote', () => ({ updatePasswordCommand: command }))
vi.mock('$lib/auth/reauth.remote', async () => (await import('$lib/auth/reauth.fixture')).reauthRemote)
vi.mock('$lib/auth/identities.remote', async () => (await import('$lib/auth/reauth.fixture')).identitiesRemote)
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
  expect(document.activeElement).toBe(newPassword())
  expect(screen.getByText('At least 8 characters.')).toBeTruthy()
  expect(command).not.toHaveBeenCalled()

  await fireEvent.input(newPassword()!, { target: { value: NEW } })
  await fireEvent.click(saveButton())
  await settle()
  expect(command).toHaveBeenCalledWith({ password: NEW })
  expect(browser.setSession).toHaveBeenCalledWith(SESSION)
  expect(browser.invalidate).toHaveBeenCalledWith('supabase:auth')
})

it('titles itself "Set a password" for an account without one', async () => {
  methods.hasPassword = false
  render(Page)
  await settle()

  expect(screen.getByRole('heading', { name: 'Set a password' })).toBeTruthy()
})

it('reveals the field on a return from Apple and mails no code', async () => {
  resetReauthRemote(true)
  methods.apple = true
  render(Page)
  await settle()

  expect(newPassword()).toBeTruthy()
  expect(reauthRemote.requestReauthCode).not.toHaveBeenCalled()
})

/** A confirmed page with the new password typed, whose save answers that it needs a fresh confirmation. */
async function typedNeedingConfirmation(apple: boolean) {
  resetReauthRemote(true)
  methods.apple = apple
  command.mockRejectedValueOnce({ body: { field: 'code', message: formError('auth_reauthRequired') } })
  render(Page)
  await settle()
  await fireEvent.input(newPassword()!, { target: { value: NEW } })
}

it('goes back to the choice with Apple when the change needs a fresh confirmation', async () => {
  await typedNeedingConfirmation(true)

  await submitNeedingConfirmationWithApple(saveButton())
})

it('opens code entry when the change needs a fresh confirmation, keeping the typed password', async () => {
  await typedNeedingConfirmation(false)
  await fireEvent.click(saveButton())
  await settle()

  expect(reauthRemote.requestReauthCode).toHaveBeenCalledOnce()
  expect(newPassword()).toBeNull()
  await enterCode('123456')
  expect(newPassword()!.value).toBe(NEW)
})
