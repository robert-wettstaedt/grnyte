import { APP_HOME_PATH, isSameOriginPath, oauthReturnTarget, signedInRedirectTarget } from '$lib/auth'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

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
    '/set\ttings',
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

describe('oauthReturnTarget, below the browser floor (no URL.parse)', () => {
  // Shadowed rather than deleted: jsdom's URL inherits Node's static method.
  beforeAll(() => {
    Object.defineProperty(URL, 'parse', { configurable: true, value: undefined })
  })
  afterAll(() => {
    Reflect.deleteProperty(URL, 'parse')
  })

  it('really has none', () => {
    expect(URL.parse).toBeUndefined()
  })

  it.each([
    ['/regions/1/delete', 'confirm', '/regions/1/delete'],
    ['/regions/1/../2/delete', 'confirm', '/regions/2/delete'],
    ['https://evil.example', 'confirm', '/settings'],
    ['//evil.example', 'confirm', '/settings'],
    ['/\\evil.example', 'confirm', '/settings'],
    ['/regions/1/\tdelete', 'confirm', '/settings'],
    ['/regions/1/\ndelete', 'confirm', '/settings'],
    ['/auth/signin', 'confirm', '/settings'],
    ['/regions/1/delete', 'link', '/settings/sign-in-methods'],
    ['/auth/signup', 'signin', '/auth/signup?form=signup'],
    ['/auth/signin', 'signin', '/auth/signin?form=signin'],
    ['/auth/evil', 'signin', '/auth/signin?form=signin'],
    ['/auth/signup?next=//evil.example', 'signin', '/auth/signup?form=signup'],
    [
      '/auth/signup?next=/invite/accept?token%3Dx',
      'signin',
      '/auth/signup?form=signup&next=%2Finvite%2Faccept%3Ftoken%3Dx',
    ],
    ['/auth/signup?next=/auth/profile', 'signin', '/auth/signup?form=signup'],
    ['/\\evil.example', 'signin', '/auth/signin?form=signin'],
    ['/auth/signup\t', 'signin', '/auth/signin?form=signin'],
    ['/regions/1/delete', 'unknown', '/auth/signin?form=signin'],
    [null, null, '/auth/signin?form=signin'],
  ])('%j for %s answers %s', (path, intent, expected) => {
    expect(oauthReturnTarget(path, intent)).toBe(expected)
  })

  it('still keeps a valid next and refuses the bypasses', () => {
    expect(signedInRedirectTarget('/invite/accept?token=x')).toBe('/invite/accept?token=x')
    expect(isSameOriginPath('/\\evil.example')).toBe(false)
  })
})
