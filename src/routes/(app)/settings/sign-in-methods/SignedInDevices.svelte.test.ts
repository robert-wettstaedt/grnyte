import '$lib/forms/screen.fixture'
import { settle } from '$lib/forms/screen.fixture'
import { setLocale } from '$lib/paraglide/runtime'
import { fireEvent, render, screen } from '@testing-library/svelte'
import { beforeEach, expect, it, onTestFinished, vi } from 'vitest'
import SignedInDevices from './SignedInDevices.svelte'

type Device = { activeAt: Date; current: boolean; id: string; signedInAt: Date }

const held = vi.hoisted(() => ({
  query: null as unknown,
  signOutDevice: vi.fn(),
  signOutOthers: vi.fn(async () => {}),
}))
vi.mock('$lib/auth/session.remote', () => ({
  signedInDevices: () => held.query,
  signOutDevice: held.signOutDevice,
  signOutOthers: held.signOutOthers,
}))

const HOUR = 3_600_000
// Reactive, as Kit's query is: the refresh below changes `current` and the list follows.
let query = $state<{ current: Device[]; error: undefined; ready: boolean; refresh: ReturnType<typeof vi.fn> }>()!

beforeEach(() => {
  query = {
    current: [
      { activeAt: new Date(), current: true, id: 'laptop', signedInAt: new Date(Date.now() - 2 * HOUR) },
      {
        activeAt: new Date(Date.now() - HOUR),
        current: false,
        id: 'phone',
        signedInAt: new Date(Date.now() - 3 * HOUR),
      },
    ],
    error: undefined,
    ready: true,
    refresh: vi.fn(async () => {
      query.current = query.current.filter((device) => device.id !== 'phone')
    }),
  }
  held.query = query
})

const rows = () => [...document.querySelectorAll('[data-device]')]

it('marks this device and offers "Sign out" only on the other one', async () => {
  render(SignedInDevices)
  await settle()

  expect(rows()).toHaveLength(2)
  expect(rows()[0].textContent).toContain('This device')
  expect(rows()[0].querySelector('button')).toBeNull()
  expect(rows()[1].querySelector('button')?.textContent).toContain('Sign out')
})

it('shows the other device pending until the command answers, then drops it after a refresh', async () => {
  let answer = () => {}
  held.signOutDevice.mockImplementationOnce(() => new Promise<void>((done) => (answer = done)))
  render(SignedInDevices)
  await settle()

  const button = rows()[1].querySelector('button')!
  await fireEvent.click(button)
  await settle()
  expect(held.signOutDevice).toHaveBeenCalledWith({ id: 'phone' })
  expect(button.disabled).toBe(true)
  expect(button.querySelector('.hidden')).toBeNull()

  answer()
  await settle()
  expect(query.refresh).toHaveBeenCalledOnce()
  expect(rows()).toHaveLength(1)
})

it('renders the times in German', async () => {
  setLocale('de', { reload: false })
  onTestFinished(() => setLocale('en', { reload: false }))
  render(SignedInDevices)
  await settle()

  expect(screen.getByText('Dieses Gerät')).toBeTruthy()
  expect(rows()[1].textContent).toContain('Angemeldet: vor 3 Stunden')
  expect(rows()[1].textContent).toContain('aktiv: vor 1 Stunde')
})
