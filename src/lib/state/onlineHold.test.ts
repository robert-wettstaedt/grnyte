import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isOnline, reportConnectionState } from './online.svelte'

/**
 * The adapter half of `online.svelte`: the ten-second hold, the change-dedupe, and the visibility
 * gate. `connectionVerdict` is pure and covered in `offlineRules.test.ts`; this covers the parts
 * around it, which is where the two worst regressions of this feature lived.
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

describe('the probe and the socket', () => {
  /**
   * `reachable` is written by two sources with different trigger semantics: the probe sets it false
   * at any moment, while `reportConnectionState` acts on a change of state NAME. A probe failing
   * while Zero sat in `connected` therefore latched the flag false with nothing able to clear it,
   * and the app claimed to be offline while syncing normally. Seen on an installed PWA whose client
   * group was active on the server with the banner up.
   */
  const failProbe = async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Load failed'))
    dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(0)
  }

  it('does not let a failed probe outrank a live socket', async () => {
    reportConnectionState({ name: 'connected' })
    await failProbe()

    // One failed request is weaker evidence than a socket that is up right now. Believing it
    // latched the banner on until the connection state happened to change, which it never did.
    expect(isOnline()).toBe(true)
  })

  it('still settles an offline start in one request', async () => {
    // The probe exists so a cold start on a dead network renders its offline state immediately
    // instead of spinning for the ten-second hold. Only a live socket may override it.
    reportConnectionState({ name: 'connecting' })
    await failProbe()

    expect(isOnline()).toBe(false)
  })

  it('clears that flag when the connection reports in, with or without a transition', async () => {
    reportConnectionState({ name: 'connecting' })
    await failProbe()
    expect(isOnline()).toBe(false)

    reportConnectionState({ name: 'connected' })
    expect(isOnline()).toBe(true)

    // And again with no change of name: `connected` is documented as the one input that clears the
    // flag unconditionally, so it must not depend on having transitioned to get there.
    reportConnectionState({ name: 'connected' })
    expect(isOnline()).toBe(true)
  })
})

describe('the navigator.onLine latch', () => {
  /**
   * `navigator.onLine` is read once at module load and afterwards only moved by transition events.
   * A false reading at startup - routine for an iOS home-screen web app, whose network attaches
   * after the web view boots - therefore stuck forever: no `online` event fires, because from the
   * browser's point of view nothing changed. Neither the probe nor the connection reporter could
   * clear it, since both only wrote `reachable`. A freshly installed PWA synced its whole guidebook
   * and still showed "You're offline".
   */
  it('lets a live socket override a browser that claims to be offline', () => {
    dispatchEvent(new Event('offline'))
    expect(isOnline()).toBe(false)

    // Zero has a socket to the server, which is proof the network works whatever the browser says.
    reportConnectionState({ name: 'connected' })
    expect(isOnline()).toBe(true)
  })

  it('lets a completed probe override it too', async () => {
    dispatchEvent(new Event('offline'))
    expect(isOnline()).toBe(false)

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 404 }))
    // `online` fires the probe; the point is that the probe's SUCCESS is what clears the flag.
    dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(0)

    expect(isOnline()).toBe(true)
  })
})
