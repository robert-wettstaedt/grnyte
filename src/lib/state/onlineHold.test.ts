import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isOnline, reportConnectionState } from './online.svelte'

/**
 * The adapter half of `online.svelte`: the ten-second hold, the change-dedupe, and the visibility
 * gate. `connectionVerdict` is pure and covered in `offlineRules.test.ts`; this covers the parts
 * around it, which is where the two worst regressions of this feature actually lived.
 *
 * Written against the module singleton rather than a seam, because that singleton is the thing with
 * the bugs. Each test drives it back to a known state through `connected`, which is the one input
 * that unconditionally clears the flag.
 */

const visibility = (state: 'hidden' | 'visible') => {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state)
}

beforeEach(() => {
  vi.useFakeTimers()
  visibility('visible')
  reportConnectionState({ name: 'connected' })
})

afterEach(() => {
  // Leave the singleton online for whatever runs next, then drop the timers and the spy.
  reportConnectionState({ name: 'connected' })
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('the unreachable hold', () => {
  it('does not call the app offline the moment a connection drops', () => {
    reportConnectionState({ name: 'connecting' })
    vi.advanceTimersByTime(9_000)

    // A normal reconnect passes through here. Firing early flashes "not downloaded" across every
    // screen for a blip nobody would otherwise notice.
    expect(isOnline()).toBe(true)
  })

  it('calls it offline once the drop has lasted', () => {
    reportConnectionState({ name: 'connecting' })
    vi.advanceTimersByTime(11_000)

    expect(isOnline()).toBe(false)
  })

  it('is not restarted by a repeat of the same state', () => {
    // Zero re-emits `connecting` on every retry, five seconds apart. Treating each emission as news
    // restarts a ten-second timer that can then never fire, which is exactly how this shipped: the
    // app stayed "online" through an indefinite outage.
    reportConnectionState({ name: 'connecting' })
    vi.advanceTimersByTime(6_000)
    reportConnectionState({ name: 'connecting' })
    vi.advanceTimersByTime(6_000)

    expect(isOnline()).toBe(false)
  })

  it('is cancelled by reconnecting before it fires', () => {
    reportConnectionState({ name: 'connecting' })
    vi.advanceTimersByTime(5_000)
    reportConnectionState({ name: 'connected' })
    vi.advanceTimersByTime(20_000)

    expect(isOnline()).toBe(true)
  })
})

describe('the hidden-tab gate', () => {
  it('does not call the app offline while the tab is in the background', () => {
    // Zero drops the socket itself after five minutes out of sight. Believing that declared the app
    // offline on perfect wifi for anybody who pocketed their phone, which at a crag is everybody.
    visibility('hidden')
    reportConnectionState({ name: 'disconnected' })
    vi.advanceTimersByTime(60_000)

    expect(isOnline()).toBe(true)
  })

  it('still notices a real outage the tab was awake for', () => {
    visibility('visible')
    reportConnectionState({ name: 'disconnected' })
    vi.advanceTimersByTime(11_000)

    expect(isOnline()).toBe(false)
  })
})

describe('states that are not about the network', () => {
  it('leaves the flag alone for a sync error rather than claiming a working connection', () => {
    reportConnectionState({ name: 'connecting' })
    vi.advanceTimersByTime(11_000)
    expect(isOnline()).toBe(false)

    // `error` says the sync is broken, not that the network came back. Setting the flag true here
    // would have hidden the offline state behind a false claim of connectivity.
    reportConnectionState({ name: 'error' })
    vi.advanceTimersByTime(11_000)
    expect(isOnline()).toBe(false)
  })

  it('takes needs-auth as proof the network works, because only a server can produce it', () => {
    reportConnectionState({ name: 'connecting' })
    vi.advanceTimersByTime(11_000)
    expect(isOnline()).toBe(false)

    // Zero will not retry out of `needs-auth` unaided, so without this the flag stayed false for as
    // long as the token stayed stale, telling somebody on perfect wifi that they were offline.
    reportConnectionState({ name: 'needs-auth' })
    expect(isOnline()).toBe(true)
  })
})
