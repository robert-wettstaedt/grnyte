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
  expect(screen.getByRole('heading', { name: 'This link is invalid or has expired' })).toBeTruthy()
  expect(actions()).toEqual([['Back to sign in', '/auth/signin?form=signin']])
})

it.each([
  ['expired', 'That took too long', 'Try again'],
  ['failed', 'That didn’t work', 'Try again'],
  ['offline', 'You’re offline', 'Try again'],
  ['exists', 'You already have an account', 'Go back'],
  ['conflict_identity', 'Already in use', 'Go back'],
  ['conflict_email', 'Address already in use', 'Go back'],
  ['evil', 'That didn’t work', 'Try again'],
  ['toString', 'That didn’t work', 'Try again'],
])('shows %s with one action back to where the flow started', (reason, title, action) => {
  open(`?reason=${reason}&intent=confirm&from=%2Fregions%2F1%2Fdelete`)
  expect(screen.getByRole('heading', { name: title })).toBeTruthy()
  expect(actions()).toEqual([[action, '/regions/1/delete']])
})

it('moves focus to the heading on load', () => {
  open('?reason=expired')
  expect(document.activeElement).toBe(screen.getByRole('heading'))
})

it('announces the offline message as a status', () => {
  open('?reason=offline')
  expect(screen.getByRole('status').textContent).toContain('without a connection')
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
