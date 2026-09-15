import { error } from '@sveltejs/kit'
import { describe, expect, it } from 'vitest'
import { isOfflineFailure } from './offlineFailure'

/** The real thing Kit throws for a server response, rather than a stand-in that proves less. */
const httpError = (): unknown => {
  try {
    error(500, 'Internal Error')
  } catch (thrown) {
    return thrown
  }
}

/** A rethrow here replaces the page and the form goes with it. */
describe('isOfflineFailure', () => {
  it('catches a dead network even while the app still believes it is online', () => {
    // `isOnline()` folds in a socket to another origin and lags a dead radio by up to twenty seconds.
    expect(isOfflineFailure(new TypeError('Failed to fetch'), true)).toBe(true)
  })

  it('catches the other engines, which word it differently', () => {
    expect(isOfflineFailure(new TypeError('Load failed'), true)).toBe(true)
    expect(isOfflineFailure(new TypeError('NetworkError when attempting to fetch resource'), true)).toBe(true)
  })

  it('still trusts the flag when the error says nothing', () => {
    expect(isOfflineFailure(new Error('boom'), false)).toBe(true)
  })

  it('rethrows a server error rather than blaming the network', () => {
    // Showing "you're offline" for a 500 would hide a genuine bug.
    // The fixture first: if `error()` stopped throwing, the assertion below would pass vacuously.
    expect(httpError()).toMatchObject({ status: 500 })
    expect(isOfflineFailure(httpError(), true)).toBe(false)
  })

  it('rethrows an ordinary throw on a working connection', () => {
    expect(isOfflineFailure(new Error('boom'), true)).toBe(false)
  })
})
