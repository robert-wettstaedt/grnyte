import { describe, expect, it } from 'vitest'
import { authClient, session } from './authClient.test-helper'
import { checkSession } from './checkSession'

const mine = { token: 'refused', userId: 'a' }
const asked = { refused: 'refused', userId: 'a' }
const gone = { code: 'session_not_found' }

describe('checkSession', () => {
  it('is signed out when nothing is stored', async () => {
    const { auth } = authClient(null)

    expect(await checkSession(auth, { userId: 'a' })).toBe('signedOut')
  })

  it.each(['AuthRetryableFetchError', 'AuthRefreshDiscardedError'])(
    'is unreadable when the read errors (%s)',
    async (name) => {
      const { auth, state } = authClient(mine)
      state.readError = { name }

      expect(await checkSession(auth, { userId: 'a' })).toBe('unreadable')
    },
  )

  it('answers the stored session when no token was refused', async () => {
    const { auth, state } = authClient(mine)

    expect(await checkSession(auth, { userId: 'a' })).toEqual(session(mine))
    expect(state.refreshes).toBe(0)
  })

  it("answers another account's session, neither refreshed nor signed out", async () => {
    const other = { token: 'refused', userId: 'b' }
    const { auth, state } = authClient(other, () => gone)

    expect(await checkSession(auth, asked)).toEqual(session(other))
    expect([state.refreshes, state.stored]).toEqual([0, other])
  })

  it('answers a newer token without a refresh', async () => {
    const newer = { token: 'newer', userId: 'a' }
    const { auth, state } = authClient(newer)

    expect(await checkSession(auth, asked)).toEqual(session(newer))
    expect(state.refreshes).toBe(0)
  })

  it('renews the refused token', async () => {
    const { auth, state } = authClient(mine, () => void (state.stored = { token: 'renewed', userId: 'a' }))

    expect(await checkSession(auth, asked)).toEqual(session({ token: 'renewed', userId: 'a' }))
  })

  it('signs out when the session is gone', async () => {
    const { auth, state } = authClient(mine, () => gone)

    expect(await checkSession(auth, asked)).toBe('signedOut')
    expect(state.stored).toBeNull()
  })

  it('answers the token another tab stored while the refresh was refused', async () => {
    const newer = { token: 'newer', userId: 'a' }
    const { auth, state } = authClient(mine, () => {
      state.stored = newer
      return { code: 'refresh_token_already_used' }
    })

    expect(await checkSession(auth, asked)).toEqual(session(newer))
    expect(state.stored).toEqual(newer)
  })

  it.each([
    ['a server error', () => ({ code: 'unexpected_failure', status: 500 })],
    ['a rate limit', () => ({ code: 'over_request_rate_limit', status: 429 })],
    ['no network', () => Promise.reject(new TypeError('Load failed'))],
  ])('keeps the session through %s', async (_, refresh) => {
    const { auth, state } = authClient(mine, refresh)

    expect(await checkSession(auth, asked)).toEqual(session(mine))
    expect(state.stored).toEqual(mine)
  })

  it('is signed out when the refused refresh emptied the store itself', async () => {
    const { auth, state } = authClient(mine, () => {
      state.stored = null
      return gone
    })

    expect(await checkSession(auth, asked)).toBe('signedOut')
  })

  it('is unreadable when the store cannot be read after a definitive refusal', async () => {
    const { auth, state } = authClient(mine, () => {
      state.readError = { name: 'AuthRetryableFetchError' }
      return gone
    })

    expect(await checkSession(auth, asked)).toBe('unreadable')
    expect(state.stored).toEqual(mine)
  })
})
