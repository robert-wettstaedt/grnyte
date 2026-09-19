import { isSameOriginPath } from '$lib/auth'
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
