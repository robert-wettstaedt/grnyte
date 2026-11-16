import '$lib/forms/screen.fixture'
import { render, screen } from '@testing-library/svelte'
import { beforeEach, expect, it, vi } from 'vitest'
import SignIn from './signin/+page.svelte'
import SignUp from './signup/+page.svelte'

const at = vi.hoisted(() => ({ url: new URL('http://localhost/auth/signin') }))
vi.mock('$app/state', () => ({ page: at }))
vi.mock('$lib/state/navigation.svelte', () => ({ replaceUrl: vi.fn() }))

/** A Kit remote form as the pages read it: attributes, fields, no result. */
const fakeForm = vi.hoisted(() => () => {
  const field = { as: (type: string) => ({ name: 'field', type }), issues: () => undefined }
  const fields = new Proxy({ allIssues: () => [], set: () => {} } as Record<string, unknown>, {
    get: (target, key: string) => target[key] ?? field,
  })
  // Only `action` and `method` enumerable: `<form {...signUp}>` spreads the rest away, as Kit's does.
  return Object.defineProperties(
    { action: '', method: 'POST' },
    {
      enhance: { value: () => ({ action: '', method: 'POST' }) },
      fields: { value: fields },
      pending: { value: 0 },
      result: { value: undefined },
    },
  )
})
vi.mock('./signin/signin.remote', () => ({ signIn: fakeForm() }))
vi.mock('$lib/auth/password.remote', () => ({ setNewPassword: vi.fn() }))
vi.mock('./signup/signup.remote', () => ({ resendSignupCode: fakeForm(), signUp: fakeForm() }))

const INVITE = '?email=invitee%40example.test&next=%2Finvite%2Fabc'
const link = (name: string) => screen.getByRole('link', { name }).getAttribute('href')

beforeEach(() => {
  at.url = new URL('http://localhost/auth/signin')
})

it('carries the invitation across both switch lines', () => {
  at.url = new URL(`http://localhost/auth/signin${INVITE}`)
  render(SignIn)
  expect(link('Create account')).toBe(`/auth/signup${INVITE}`)
})

it('carries the invitation back to sign-in, and lands a plain switch on the form', () => {
  at.url = new URL(`http://localhost/auth/signup${INVITE}`)
  const { unmount } = render(SignUp)
  expect(link('Sign in')).toBe(`/auth/signin${INVITE}`)
  unmount()

  at.url = new URL('http://localhost/auth/signup')
  render(SignUp)
  expect(link('Sign in')).toBe('/auth/signin?form=signin')
})

it('asks create account for one password with Show, and no username or repeat', () => {
  at.url = new URL('http://localhost/auth/signup')
  render(SignUp)
  expect(document.querySelectorAll('input[type="password"]')).toHaveLength(1)
  expect(screen.getByRole('button', { name: 'Show' })).toBeTruthy()
  expect(screen.queryByText('Sign up')).toBeNull()
})

it('renders the welcome fork on a bare sign-in only, hidden until the standalone rule shows it', () => {
  render(SignIn)
  const fork = document.querySelector('.welcome-fork')!
  expect(fork.classList.contains('hidden')).toBe(true)
  expect(fork.nextElementSibling?.classList.contains('signin-content')).toBe(true)
  expect(fork.querySelector('a[href="/auth/signin?form=signin"]')).toBeTruthy()
  expect(fork.querySelector('a[href="/auth/signup"]')).toBeTruthy()
})

it.each(['?form=signin', '?next=/x', '?deleted=1'])('shows the sign-in form and no fork for %s', (search) => {
  at.url = new URL(`http://localhost/auth/signin${search}`)
  render(SignIn)
  expect(document.querySelector('.welcome-fork')).toBeNull()
  expect(document.querySelector('.signin-content form')).toBeTruthy()
})
