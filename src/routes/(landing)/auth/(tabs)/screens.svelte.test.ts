import { at } from '$lib/forms/page.fixture.svelte'
import { settle } from '$lib/forms/screen.fixture'
import { render, screen, within } from '@testing-library/svelte'
import { beforeEach, expect, it, vi } from 'vitest'
import SignIn from './signin/+page.svelte'
import { signIn } from './signin/signin.remote'
import SignUp from './signup/+page.svelte'
import { signUp } from './signup/signup.remote'

vi.mock('$app/state', async () => ({ page: (await import('$lib/forms/page.fixture.svelte')).at }))
vi.mock('$lib/state/navigation.svelte', () => ({ replaceUrl: vi.fn() }))
vi.mock('./signin/signin.remote', async () => ({
  signIn: (await import('$lib/forms/page.fixture.svelte')).fakeRemoteForm(),
}))
vi.mock('$lib/auth/password/password.remote', () => ({ setNewPassword: vi.fn() }))
vi.mock('./signup/signup.remote', async () => {
  const { fakeRemoteForm } = await import('$lib/forms/page.fixture.svelte')
  return { resendSignupCode: fakeRemoteForm(), signUp: fakeRemoteForm() }
})

const INVITE = '?email=invitee%40example.test&next=%2Finvite%2Fabc'
const link = (name: string) => screen.getAllByRole('link', { name })[0].getAttribute('href')
const choice = () => screen.queryByRole('button', { name: 'Continue with Apple' })
const emailField = () => document.querySelector<HTMLInputElement>('input[type="email"]')
const fake = (form: unknown) => form as ReturnType<typeof import('$lib/forms/page.fixture.svelte').fakeRemoteForm>

/** Follows a link as Kit would: the URL changes, the page component stays. */
async function follow(name: string) {
  at.url = new URL(link(name)!, at.url)
  await settle()
}

function visit(path: string, providers: string[] = [], lastUsed: null | string = null) {
  at.url = new URL(`http://localhost${path}`)
  at.data = { lastUsed, providers }
}

beforeEach(() => {
  visit('/auth/signin')
  for (const form of [signIn, signUp]) fake(form).set.mockClear()
})

it('carries the invitation across both switch lines', () => {
  visit(`/auth/signin${INVITE}`)
  render(SignIn)
  expect(link('Create account')).toBe(`/auth/signup${INVITE}`)
})

it('carries the invitation back to sign-in, and lands a plain switch on the form', () => {
  visit(`/auth/signup${INVITE}`)
  const { unmount } = render(SignUp)
  expect(link('Sign in')).toBe(`/auth/signin${INVITE}`)
  unmount()

  visit('/auth/signup')
  render(SignUp)
  expect(link('Sign in')).toBe('/auth/signin?form=signin')
})

it('asks create account for one password with Show, and no username or repeat', () => {
  visit('/auth/signup')
  render(SignUp)
  expect(document.querySelectorAll('input[type="password"]')).toHaveLength(1)
  expect(screen.getByRole('button', { name: 'Show' })).toBeTruthy()
  expect(screen.queryByText('Sign up')).toBeNull()
})

it('renders the welcome fork on a bare sign-in only, hidden until the standalone rule shows it', () => {
  visit('/auth/signin', ['apple', 'google'])
  render(SignIn)
  const fork = document.querySelector('.welcome-fork')!
  expect(fork.classList.contains('hidden')).toBe(true)
  expect(fork.nextElementSibling?.classList.contains('signin-content')).toBe(true)
  expect(fork.querySelector('a[href="/auth/signin?form=signin"]')).toBeTruthy()
  expect(fork.querySelector('a[href="/auth/signup"]')).toBeTruthy()
})

it.each(['?form=signin', '?next=/x', '?deleted=1'])('shows the sign-in form and no fork for %s', (search) => {
  visit(`/auth/signin${search}`)
  render(SignIn)
  expect(document.querySelector('.welcome-fork')).toBeNull()
  expect(document.querySelector('.signin-content form')).toBeTruthy()
})

it('opens on the choice with a provider, the title above it, and badges email on sign-in only', () => {
  visit('/auth/signin?form=signin', ['apple', 'google'], 'email')
  const { unmount } = render(SignIn)
  expect(emailField()).toBeNull()
  expect(screen.getByRole('heading').compareDocumentPosition(choice()!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  expect(choice()!.closest('.signin-content')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Continue with email' }).getAttribute('aria-describedby')).toBeTruthy()
  unmount()

  visit('/auth/signup', ['apple', 'google'], 'email')
  render(SignUp)
  expect(screen.queryByText('Last used')).toBeNull()
})

it('hands an invitation to the provider forms and fills the email step', async () => {
  visit(`/auth/signin${INVITE}`, ['apple', 'google'])
  render(SignIn)
  expect(document.querySelector<HTMLInputElement>('form[action="/auth/oauth/apple"] input[name="next"]')?.value).toBe(
    '/invite/abc',
  )

  await follow('Continue with email')
  expect(at.url.search).toBe(`${INVITE}&method=email`)
  // The values the form ends with, after Kit's re-read of the reset form: not just a `set` call.
  expect(fake(signIn).values).toEqual({ email: 'invitee@example.test' })
  await follow('Other ways to sign in')
  await follow('Continue with email')
  expect(fake(signIn).values).toEqual({ email: 'invitee@example.test' })
})

it('keeps an invited address on the create-account email step', async () => {
  visit(`/auth/signup${INVITE}`, ['apple', 'google'])
  render(SignUp)

  await follow('Continue with email')
  expect(fake(signUp).values).toEqual({ email: 'invitee@example.test' })
})

it('moves focus into each step and back, in one container of one height', async () => {
  visit('/auth/signin?form=signin', ['apple', 'google'])
  render(SignIn)
  const container = document.querySelector('.auth-steps')!

  await follow('Continue with email')
  expect(document.activeElement).toBe(emailField())
  expect(document.querySelector('.auth-steps')).toBe(container)
  expect(container.className).toContain('min-h-')

  at.url = new URL('http://localhost/auth/signin?form=signin')
  await settle()
  expect(document.activeElement).toBe(choice())
})

it('shows the form at once without a provider, and on a no-JS submit URL', () => {
  visit('/auth/signin?form=signin')
  const { unmount } = render(SignIn)
  expect(emailField()).toBeTruthy()
  expect(screen.queryByRole('link', { name: 'Other ways to sign in' })).toBeNull()
  unmount()

  visit('/auth/signin?/remote=abc', ['apple', 'google'])
  render(SignIn)
  expect(emailField()).toBeTruthy()
})

it('shows the deletion message on the choice', () => {
  visit('/auth/signin?deleted=1', ['apple', 'google'])
  render(SignIn)
  expect(screen.getByRole('status').textContent).toContain('deleted')
  expect(choice()).toBeTruthy()
})

it('opens create account on its choice from the sign-in email step, and sign-in on the form from create account', () => {
  visit('/auth/signin?method=email', ['apple', 'google'])
  const { unmount } = render(SignIn)
  expect(link('Create account')).toBe('/auth/signup')
  unmount()

  visit('/auth/signup?method=email', ['apple', 'google'])
  render(SignUp)
  expect(link('Sign in')).toBe('/auth/signin?form=signin')
})

it('clears a failed sign-in on the way back, with the hint only when a provider exists', async () => {
  visit('/auth/signin?method=email', ['apple', 'google'])
  render(SignIn)
  fake(signIn).fail('auth_invalidCredentials')
  await settle()
  const banner = screen.getByRole('alert')
  expect(banner.textContent).toContain('Wrong email or password')
  expect(banner.textContent).toContain('Signed up with Apple or Google?')
  expect(within(banner).getByRole('link', { name: 'Go back and choose it there.' }).getAttribute('href')).toBe(
    '/auth/signin?form=signin',
  )

  await follow('Other ways to sign in')
  expect(screen.queryByText('Wrong email or password')).toBeNull()
  expect(choice()).toBeTruthy()
  await follow('Continue with email')
  expect(screen.queryByText('Wrong email or password')).toBeNull()
  expect(fake(signIn).set).toHaveBeenLastCalledWith({})
})

it('names the way back by screen: sign in, or sign up', () => {
  visit('/auth/signup?method=email', ['apple', 'google'])
  const { unmount } = render(SignUp)
  expect(link('Other ways to sign up')).toBe('/auth/signup')
  expect(screen.queryByRole('link', { name: 'Other ways to sign in' })).toBeNull()
  unmount()

  visit('/auth/signin?method=email', ['apple', 'google'])
  render(SignIn)
  expect(link('Other ways to sign in')).toBe('/auth/signin?form=signin')
})

it('gives no hint without a provider', async () => {
  visit('/auth/signin?form=signin')
  render(SignIn)
  fake(signIn).fail('auth_invalidCredentials')
  await settle()
  expect(screen.getByText('Wrong email or password')).toBeTruthy()
  expect(screen.queryByText(/Signed up with Apple or Google/)).toBeNull()
})
