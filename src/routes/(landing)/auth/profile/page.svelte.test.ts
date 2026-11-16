import '$lib/forms/screen.fixture'
import { setLocale } from '$lib/paraglide/runtime'
import { fireEvent, render, screen } from '@testing-library/svelte'
import { expect, it, onTestFinished, vi } from 'vitest'
import Page from './+page.svelte'
import { completeProfile } from './profile.remote'

vi.mock('$app/state', () => ({ page: { url: new URL('http://localhost/auth/profile') } }))
vi.mock('$app/navigation', () => ({ invalidate: vi.fn() }))
vi.mock('$lib/state/navigation.svelte', () => ({ replaceUrl: vi.fn() }))
vi.mock('$lib/state/pwa/wipe', () => ({ wipeAndLeave: vi.fn() }))
vi.mock('$lib/auth/session.remote', () => ({
  signOut: {
    enhance: () => ({ action: '?/signOut', method: 'POST' }),
    fields: { redirectTo: { as: (type: string, value: string) => ({ name: 'redirectTo', type, value }) } },
    pending: 0,
  },
}))
vi.mock('./profile.remote', () => ({ completeProfile: vi.fn(async () => ({ redirectTo: '/' })) }))

const checked = () => (screen.getAllByRole('radio') as HTMLInputElement[]).find((radio) => radio.checked)?.value

it('preselects V in English and asks for the username without autocorrect', () => {
  render(Page)
  expect(checked()).toBe('V')
  const username = screen.getByLabelText('Username')
  expect(username.getAttribute('autocapitalize')).toBe('none')
  expect(username.getAttribute('spellcheck')).toBe('false')
})

it('hints at the username rules, and offers a way to sign out instead', () => {
  render(Page)
  expect(screen.getByText('Letters, numbers, dashes and underscores.')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Sign out' }).closest('form')).toBeTruthy()
})

it('preselects FB in German', () => {
  setLocale('de', { reload: false })
  onTestFinished(() => setLocale('en', { reload: false }))
  render(Page)
  expect(checked()).toBe('FB')
})

it('submits the scale pressed in the segmented control', async () => {
  render(Page)
  await fireEvent.input(screen.getByLabelText('Username'), { target: { value: 'sam_rivera' } })
  await fireEvent.click(screen.getByText('Font'))
  await fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

  await vi.waitFor(() => expect(completeProfile).toHaveBeenCalledWith(expect.objectContaining({ gradingScale: 'FB' })))
})
