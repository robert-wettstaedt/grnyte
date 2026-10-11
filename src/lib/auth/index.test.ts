import { APP_HOME_PATH, isSameOriginPath, signedInRedirectTarget } from '$lib/auth'
import { describe, expect, it } from 'vitest'

// The one thing standing between a form-submitted `redirectTo` and an open redirect, so the
// bypasses a `startsWith('/')` check waves through are what this asserts.
describe('isSameOriginPath', () => {
  it.each(['/auth', '/explore', '/invite/accept?token=abc', '/settings#email'])('accepts %s', (path) => {
    expect(isSameOriginPath(path)).toBe(true)
  })

  it.each([
    'https://evil.com',
    '//evil.com',
    '/\\evil.com',
    '/\t/evil.com',
    '\\\\evil.com',
    'javascript:alert(1)',
    'auth',
  ])('rejects %j', (path) => {
    expect(isSameOriginPath(path)).toBe(false)
  })
})

describe('signedInRedirectTarget', () => {
  it.each([
    ['//evil.example'],
    ['https://evil.example'],
    ['/auth'],
    ['/auth/signin?next=/explore'],
    ['/settings\r\n'],
    ['/set\ttings'],
    [null],
    [undefined],
  ])('falls back to home for %j', (next) => {
    expect(signedInRedirectTarget(next)).toBe(APP_HOME_PATH)
  })

  it('keeps a valid path with its search and hash', () => {
    expect(signedInRedirectTarget('/invite/accept?token=abc#top')).toBe('/invite/accept?token=abc#top')
  })
})
