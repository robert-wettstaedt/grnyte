import '$lib/forms/screen.fixture'
import type { LastMethod } from '$lib/auth'
import { fireEvent, render, screen } from '@testing-library/svelte'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import ProviderBlock from './ProviderBlock.svelte'

const at = vi.hoisted(() => ({ url: new URL('http://localhost/auth/signin?next=%2Finvite%2Fabc') }))
vi.mock('$app/state', () => ({ page: at }))

const NAMES = ['Continue with Apple', 'Continue with Google', 'Continue with email']
const submits: SubmitEvent[] = []
// jsdom cannot navigate; the block's own handler has run by the time this bubbles up.
const stop = (event: Event) => {
  submits.push(event as SubmitEvent)
  event.preventDefault()
}

beforeEach(() => {
  submits.length = 0
  document.addEventListener('submit', stop)
})
afterEach(() => {
  document.removeEventListener('submit', stop)
  vi.restoreAllMocks()
})

function show(lastUsed: LastMethod | null = null, screen: 'signin' | 'signup' = 'signin') {
  return render(ProviderBlock, { lastUsed, next: '/invite/abc', providers: ['google', 'apple'], screen })
}

const control = (name: string) => screen.getByRole(name.endsWith('email') ? 'link' : 'button', { name })

it.each([null, 'apple', 'google', 'email'] as const)('names the controls exactly, badge %s only described', (last) => {
  show(last)
  for (const name of NAMES) expect(control(name).textContent?.trim()).toBe(name)
  const described = NAMES.filter((name) => control(name).hasAttribute('aria-describedby'))
  expect(described).toEqual(
    last == null ? [] : [`Continue with ${last === 'email' ? 'email' : last[0].toUpperCase() + last.slice(1)}`],
  )
  if (last != null) {
    const badge = document.getElementById(control(described[0]).getAttribute('aria-describedby')!)
    expect(badge?.textContent?.trim()).toBe('Last used')
  }
})

it('never badges email on create account', () => {
  show('email', 'signup')
  expect(screen.queryByText('Last used')).toBeNull()
})

it('puts Apple first, hides the logos, and posts intent, screen and next', () => {
  show()
  const forms = [...document.querySelectorAll('form')]
  expect(forms.map((form) => form.getAttribute('action'))).toEqual(['/auth/oauth/apple', '/auth/oauth/google'])
  expect(Object.fromEntries(new FormData(forms[0]))).toEqual({
    intent: 'signin',
    next: '/invite/abc',
    screen: 'signin',
  })
  for (const svg of document.querySelectorAll('svg')) expect(svg.getAttribute('aria-hidden')).toBe('true')
  expect(control('Continue with email').getAttribute('href')).toBe('/auth/signin?next=%2Finvite%2Fabc&method=email')
})

it('shows the pressed button pending and disables the other two at press', async () => {
  show()
  await fireEvent.click(control('Continue with Google'))

  expect(submits.length).toBe(1)
  expect(control('Continue with Google').getAttribute('aria-busy')).toBe('true')
  expect(control('Continue with Google').textContent?.trim()).toBe('Continue with Google')
  expect((control('Continue with Apple') as HTMLButtonElement).disabled).toBe(true)
  expect(control('Continue with email').getAttribute('aria-disabled')).toBe('true')
})

it('offline, shows the message and does not leave', async () => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  show()
  await fireEvent.click(control('Continue with Apple'))

  expect(submits[0].defaultPrevented).toBe(true)
  expect(screen.getByRole('alert').textContent).toContain(
    'You’re offline. Connect to the internet to continue with Apple or Google.',
  )
  expect((control('Continue with Google') as HTMLButtonElement).disabled).toBe(false)
})
