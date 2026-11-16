import { appleButton, reauthRemote, resetReauthRemote } from '$lib/auth/reauth.fixture'
import { settle } from '$lib/forms/screen.fixture'
import { toaster } from '$lib/state/toast'
import { fireEvent, render, screen, within } from '@testing-library/svelte'
import { slide } from 'svelte/transition'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import Page from './+page.svelte'

type State = { canUnlink: boolean; linked: boolean; relinks: boolean }
const at = vi.hoisted(() => ({ url: new URL('http://localhost/settings/sign-in-methods') }))
vi.mock('$app/state', () => ({ page: at }))
vi.mock('$lib/state/navigation.svelte', () => ({ back: vi.fn(), replaceUrl: vi.fn(async () => {}) }))
vi.mock('$lib/auth/reauth.remote', async () => (await import('$lib/auth/reauth.fixture')).reauthRemote)
vi.mock('$lib/auth/session.remote', () => ({
  signedInDevices: () => ({ current: [], error: undefined, ready: true, refresh: async () => {} }),
  signOutDevice: vi.fn(),
  signOutOthers: vi.fn(),
}))
// Called at render, after `identities` below exists.
vi.mock('$lib/auth/identities.remote', () => ({
  signInMethodsQuery: () => identities.signInMethodsQuery(),
  unlinkProvider: (args: { provider: 'apple' | 'google' }) => identities.unlinkProvider(args),
}))
vi.mock('svelte/transition', async (original) => {
  const real = await original<typeof import('svelte/transition')>()
  return { ...real, slide: vi.fn(real.slide) }
})

const off: State = { canUnlink: false, linked: false, relinks: false }
// Reactive, as Kit's query is: an unlink's refresh changes `current` and the rows follow.
const answer = $state({
  configured: ['apple', 'google'] as string[],
  hasPassword: true,
  providers: { apple: { ...off }, google: { ...off } },
})
// The answer arrives after the first render, as a reload's does.
const query = $state({ ready: false })
const identities = {
  signInMethodsQuery: () => ({
    get current() {
      return query.ready ? answer : undefined
    },
    error: undefined,
    get ready() {
      return query.ready
    },
    refresh: async () => {},
  }),
  unlinkProvider: vi.fn(async ({ provider }: { provider: 'apple' | 'google' }) => {
    answer.providers[provider] = { ...off }
    return { othersSignedOut: true }
  }),
}

const button = (name: string) => screen.queryByRole('button', { name })
const row = (provider: string) => document.querySelector<HTMLElement>(`[data-provider="${provider}"]`)!
const submits = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => {})

async function visit(search = '', set: Partial<typeof answer> = {}) {
  at.url = new URL(`http://localhost/settings/sign-in-methods${search}`)
  Object.assign(answer, { configured: ['apple', 'google'], hasPassword: true, ...set })
  query.ready = false
  render(Page)
  await settle()
  query.ready = true
  await settle()
}

beforeEach(() => {
  resetReauthRemote(false)
  answer.providers = { apple: { ...off }, google: { ...off } }
  submits.mockClear()
  vi.mocked(slide).mockClear()
  identities.unlinkProvider.mockClear()
})
afterEach(() => document.querySelectorAll('body > form').forEach((form) => form.remove()))

it('shows a Google-only account how to set a password, Google not removable, and its devices', async () => {
  answer.providers.google = { canUnlink: false, linked: true, relinks: false }
  await visit('', { hasPassword: false })

  expect(screen.getByRole('link', { name: /Password/ }).textContent).toContain('Set a password')
  expect(row('google').textContent).toContain('Connected')
  expect((button('Remove') as HTMLButtonElement).disabled).toBe(true)
  expect(row('google').textContent).toContain('Set a password or add another sign-in method first.')
  expect(button('Sign out other devices')).toBeTruthy()
  expect(screen.getByText('Signed-in devices')).toBeTruthy()
})

it('offers Add only for a configured provider', async () => {
  await visit('', { configured: ['google'] })
  expect(row('apple').querySelector('button')).toBeNull()
  expect(row('google').querySelector('button')?.textContent?.trim()).toBe('Add')
})

it.each([true, false])('says whether the provider re-links on Remove (relinks: %s)', async (relinks) => {
  answer.providers.google = { canUnlink: true, linked: true, relinks }
  await visit()
  await fireEvent.click(button('Remove')!)
  await settle()

  expect(!!screen.queryByText(/You can still sign in with Google, because Google manages this address/)).toBe(relinks)
  expect(slide).toHaveBeenCalled()
})

it.each([
  ['remove-apple', 'identity.unlink', 'apple', 'filled'],
  ['add-google', 'identity.link', 'google', 'plain'],
  ['remove-google', 'identity.unlink', 'google', 'plain'],
])('confirms %s with Apple, coming back to that step', async (step, action, target, variant) => {
  answer.providers.apple = { canUnlink: true, linked: true, relinks: false }
  if (step === 'remove-google') answer.providers.google = { canUnlink: true, linked: true, relinks: false }
  await visit()
  await fireEvent.click(within(row(target)).getByRole('button'))
  await settle()

  expect(!!screen.queryByText('This also disconnects grnyte from your Apple ID.')).toBe(variant === 'filled')
  await fireEvent.click(appleButton()!)
  const form = document.querySelector<HTMLFormElement>('body > form')!
  expect(form.getAttribute('action')).toBe('/auth/oauth/apple')
  expect(Object.fromEntries(new FormData(form))).toEqual({
    action,
    intent: 'confirm',
    returnTo: `/settings/sign-in-methods?step=${step}`,
    target,
  })
  expect(submits).toHaveBeenCalledOnce()
})

it('reopens Remove Apple from ?step= without sliding, confirmed, and one press removes it', async () => {
  resetReauthRemote(true)
  answer.providers.apple = { canUnlink: true, linked: true, relinks: false }
  const toast = vi.spyOn(toaster, 'create')
  await visit('?step=remove-apple')

  expect(slide).not.toHaveBeenCalled()
  expect(reauthRemote.requestReauthCode).not.toHaveBeenCalled()
  await fireEvent.click(button('Remove Apple')!)
  await settle()

  expect(identities.unlinkProvider).toHaveBeenCalledWith({ provider: 'apple' })
  expect(row('apple').textContent).toContain('Not connected')
  expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Apple removed' }))
})

it('reopens Add Google confirmed, whose button starts the link', async () => {
  resetReauthRemote(true)
  await visit('?step=add-google')

  const form = button('Add Google')!.closest('form')!
  expect(form.getAttribute('action')).toBe('/auth/oauth/google')
  expect(Object.fromEntries(new FormData(form))).toEqual({ intent: 'link' })
})

it('opens nothing for Add on a provider this origin does not offer', async () => {
  await visit('?step=add-google', { configured: ['apple'] })
  expect(button('Send code')).toBeNull()
})

it('opens nothing for a step whose action is gone, and names a completed link', async () => {
  const toast = vi.spyOn(toaster, 'create')
  answer.providers.google = { canUnlink: true, linked: true, relinks: false }
  await visit('?step=remove-apple&linked=google')

  expect(button('Send code')).toBeNull()
  expect(row('google').textContent).toContain('Connected')
  expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Google added' }))
})
