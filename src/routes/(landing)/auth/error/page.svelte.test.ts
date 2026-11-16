import { render, screen } from '@testing-library/svelte'
import { expect, it, vi } from 'vitest'
import Page from './+page.svelte'

const at = vi.hoisted(() => ({ url: new URL('http://localhost/auth/error') }))
vi.mock('$app/state', () => ({ page: at }))

function open(search: string) {
  at.url = new URL(`http://localhost/auth/error${search}`)
  return render(Page)
}

const actions = () => screen.getAllByRole('link').map((link) => [link.textContent?.trim(), link.getAttribute('href')])

it('keeps the invalid-link copy without a reason', () => {
  open('')
  expect(screen.getByRole('heading', { name: 'This link no longer works' })).toBeTruthy()
  expect(screen.getByText('It’s invalid or has expired.')).toBeTruthy()
  expect(actions()).toEqual([['Back to sign in', '/auth/signin?form=signin']])
})

it.each([
  ['expired', 'That took too long', 'The sign-in expired before you came back. Try again.'],
  ['failed', 'Sign-in didn’t work', 'Apple or Google couldn’t finish signing you in. Try again.'],
  ['offline', 'You’re offline', 'Connect to the internet and try again.'],
  ['conflict_identity', 'Sign-in didn’t work', 'Apple or Google couldn’t finish signing you in. Try again.'],
  ['evil', 'Sign-in didn’t work', 'Apple or Google couldn’t finish signing you in. Try again.'],
  ['toString', 'Sign-in didn’t work', 'Apple or Google couldn’t finish signing you in. Try again.'],
])('shows %s with "Try again" back to where the flow started', (reason, title, body) => {
  open(`?reason=${reason}&intent=confirm&from=%2Fregions%2F1%2Fdelete`)
  expect(screen.getByRole('heading', { name: title })).toBeTruthy()
  expect(screen.getByText(body)).toBeTruthy()
  expect(actions()).toEqual([['Try again', '/regions/1/delete']])
})

it.each([
  ['conflict_identity', 'apple', 'This Apple ID is on another account', /remove Apple from it/],
  ['conflict_identity', 'google', 'This Google account is on another account', /remove Google from it/],
  ['conflict_email', 'google', 'That email belongs to another account', /so we can’t add Google here/],
  ['conflict_email', 'apple', 'That email belongs to another account', /so we can’t add Apple here/],
])('names the provider on %s (%s), back to settings', (reason, provider, title, body) => {
  open(`?reason=${reason}&provider=${provider}&intent=link&from=%2Fsettings%2Fsign-in-methods`)
  expect(screen.getByRole('heading', { name: title })).toBeTruthy()
  expect(screen.getByText(body)).toBeTruthy()
  expect(actions()).toEqual([['Back to settings', '/settings/sign-in-methods']])
})

it('sends exists to sign in', () => {
  open('?reason=exists&intent=signin&from=%2Fauth%2Fsignup')
  expect(screen.getByRole('heading', { name: 'You already have an account' })).toBeTruthy()
  expect(actions()).toEqual([['Sign in', '/auth/signin?form=signin']])
})

it.each([
  ['expired', 'clock'],
  ['failed', 'triangle-alert'],
  ['offline', 'cloud-off'],
  ['exists', 'user-check'],
])('draws %s in a tile with its own icon', (reason, icon) => {
  open(`?reason=${reason}`)
  expect(document.querySelector(`[aria-hidden="true"] svg.lucide-${icon}`)).toBeTruthy()
})

it('moves focus to the heading on load', () => {
  open('?reason=expired')
  expect(document.activeElement).toBe(screen.getByRole('heading'))
})

it('announces the offline message as a status', () => {
  open('?reason=offline')
  expect(screen.getByRole('status').textContent).toContain('Connect to the internet')
})

it('shows exists without any address, whatever the query carries', () => {
  open('?reason=exists&intent=signin&email=victim%40example.test')
  expect(document.body.textContent).not.toContain('victim')
  expect(document.body.textContent).not.toMatch(/Apple|Google/)
})

it.each([
  ['?reason=failed&intent=confirm&from=https://evil.example', '/settings'],
  ['?reason=failed&intent=signin&from=%2Fauth%2Fsignup%3Fnext%3D%2F%2Fevil.example', '/auth/signup?form=signup'],
  ['?reason=expired&intent=link&from=%2Fsettings%2Fsign-in-methods%3Fstep%3Dadd-google', '/settings/sign-in-methods'],
])('reads from through oauthReturnTarget: %s', (search, href) => {
  open(search)
  expect(actions()).toEqual([[expect.any(String), href]])
})
