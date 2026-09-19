import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AUTH_RETRY_COOLDOWN_MS, authRetryDelay, startAuthRecovery, stopAuthRecovery } from './authRecovery'

/** Zero stops retrying in `needs-auth`; only `connect()` with a fresh token revives it. */
describe('authRetryDelay', () => {
  it('asks straight away when the connection says the last token was rejected', () => {
    expect(authRetryDelay('needs-auth', 0, AUTH_RETRY_COOLDOWN_MS)).toBe(0)
  })

  it('leaves every other connection state alone', () => {
    for (const state of ['connected', 'connecting', 'disconnected', 'closed']) {
      expect(authRetryDelay(state, 0, 10_000_000)).toBeNull()
    }
  })

  it('does not treat a broken sync as a token problem', () => {
    // A fatal sync failure on a connection whose token may be fine; refreshing cannot mend it.
    expect(authRetryDelay('error', 0, 10_000_000)).toBeNull()
  })

  it('defers rather than declines while the cooldown is running', () => {
    // The caller cancels the pending timer on every connection change, so answering "not yet"
    // strands it with no engine. A flap out to `connecting` and back inside the cooldown does that.
    expect(authRetryDelay('needs-auth', 1_000, 1_000)).toBe(AUTH_RETRY_COOLDOWN_MS)
    expect(authRetryDelay('needs-auth', 1_000, 1_000 + AUTH_RETRY_COOLDOWN_MS - 1)).toBe(1)
    expect(authRetryDelay('needs-auth', 1_000, 1_000 + AUTH_RETRY_COOLDOWN_MS)).toBe(0)
  })

  it('never asks for a negative wait', () => {
    expect(authRetryDelay('needs-auth', 1_000, 10_000_000)).toBe(0)
  })
})

describe('the recovery chain', () => {
  let refreshes = 0
  let settle: (session: null | string) => void

  /** Never resolves on its own, so a test can hold an attempt mid-flight and tear down underneath it. */
  const refresh = () => {
    refreshes += 1
    return new Promise<null | string>((resolve) => {
      settle = resolve
    })
  }

  beforeEach(() => {
    vi.useFakeTimers()
    refreshes = 0
  })

  afterEach(() => {
    stopAuthRecovery()
    vi.useRealTimers()
  })

  it('keeps asking until a token arrives', async () => {
    const onSession = vi.fn()
    startAuthRecovery(0, { onSession, refresh, wants: () => true })

    await vi.advanceTimersByTimeAsync(0)
    expect(refreshes).toBe(1)

    settle(null)
    await vi.advanceTimersByTimeAsync(AUTH_RETRY_COOLDOWN_MS)
    expect(refreshes).toBe(2)

    settle('fresh-token')
    await vi.advanceTimersByTimeAsync(0)
    expect(onSession).toHaveBeenCalledWith('fresh-token')

    // Stopped: a token arrived, so nothing re-arms.
    await vi.advanceTimersByTimeAsync(AUTH_RETRY_COOLDOWN_MS * 3)
    expect(refreshes).toBe(2)
  })

  it('stays stopped when the teardown lands mid-request and nothing restarts it', async () => {
    // Not cancellable across its own `await`: the resolving attempt can arm a chain nobody owns.
    const onSession = vi.fn()
    startAuthRecovery(0, { onSession, refresh, wants: () => true })
    await vi.advanceTimersByTimeAsync(0)
    expect(refreshes).toBe(1)

    stopAuthRecovery()
    settle(null)
    await vi.advanceTimersByTimeAsync(0)

    await vi.advanceTimersByTimeAsync(AUTH_RETRY_COOLDOWN_MS * 3)

    expect(refreshes).toBe(1)
  })

  it('runs one chain, not two, when it is restarted mid-request', async () => {
    // Stop during the round trip, then start again: only one ask may follow each cooldown.
    const onSession = vi.fn()
    startAuthRecovery(0, { onSession, refresh, wants: () => true })
    await vi.advanceTimersByTimeAsync(0)

    stopAuthRecovery()
    settle(null)
    await vi.advanceTimersByTimeAsync(0)

    startAuthRecovery(0, { onSession, refresh, wants: () => true })
    await vi.advanceTimersByTimeAsync(0)
    expect(refreshes).toBe(2)

    settle(null)
    await vi.advanceTimersByTimeAsync(AUTH_RETRY_COOLDOWN_MS)

    expect(refreshes).toBe(3)
  })

  it('replaces a scheduled attempt rather than adding to it', async () => {
    // Only matters to a caller that does not stop first, which the exported API allows.
    const onSession = vi.fn()
    startAuthRecovery(AUTH_RETRY_COOLDOWN_MS, { onSession, refresh, wants: () => true })
    startAuthRecovery(0, { onSession, refresh, wants: () => true })

    await vi.advanceTimersByTimeAsync(0)
    expect(refreshes).toBe(1)

    // The first schedule's moment passes with nothing behind it.
    await vi.advanceTimersByTimeAsync(AUTH_RETRY_COOLDOWN_MS)
    expect(refreshes).toBe(1)
  })

  it('refuses a token that arrived for an identity that has since changed', async () => {
    // Sign-out racing a refresh: the old user's token would preload their rows after logout.
    const onSession = vi.fn()
    startAuthRecovery(0, { onSession, refresh, wants: () => false })
    await vi.advanceTimersByTimeAsync(0)

    settle('token-for-the-previous-user')
    await vi.advanceTimersByTimeAsync(0)

    expect(onSession).not.toHaveBeenCalled()
  })

  it('still uses a token that arrives after it was stopped', async () => {
    // Discarding it would park Zero for another cooldown for nothing.
    const onSession = vi.fn()
    startAuthRecovery(0, { onSession, refresh, wants: () => true })
    await vi.advanceTimersByTimeAsync(0)

    stopAuthRecovery()
    settle('late-token')
    await vi.advanceTimersByTimeAsync(0)

    expect(onSession).toHaveBeenCalledWith('late-token')
  })
})
