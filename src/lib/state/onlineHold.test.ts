import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The adapter half of `online.svelte`, which is where every regression has lived. A fresh module per
 * test, with `fetch` and `navigator.onLine` stubbed BEFORE import so the boot probe is deterministic.
 */

type OnlineModule = typeof import('./online.svelte')

/** `hang` is the default so a test only sees the boot probe's verdict when it asks for one. */
type Probe = 'fail' | 'hang' | 'ok'

let probe: Probe = 'hang'
let pending: Array<{ reject: () => void; resolve: () => void }> = []
let listeners: Array<[EventTarget, string, EventListenerOrEventListenerObject]> = []
let onLineDescriptor: PropertyDescriptor | undefined

const fetchStub = vi.fn(() => {
  if (probe === 'ok') {
    return Promise.resolve(new Response(null, { status: 404 }))
  }

  if (probe === 'fail') {
    return Promise.reject(new TypeError('Load failed'))
  }

  return new Promise<Response>((resolve, reject) => {
    pending.push({
      reject: () => reject(new TypeError('Load failed')),
      resolve: () => resolve(new Response(null, { status: 404 })),
    })
  })
})

const visibility = (state: 'hidden' | 'visible') => {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state)
}

const setOnLine = (value: boolean) => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value })
}

/** `resetModules` leaves the old copy's listeners registered, so an orphan's probe can make an
 *  ordering assertion vacuous. Tracked and removed per test. */
const load = async (options: { onLine?: boolean; probe?: Probe } = {}): Promise<OnlineModule> => {
  probe = options.probe ?? 'hang'
  setOnLine(options.onLine ?? true)
  vi.stubGlobal('fetch', fetchStub)

  const addToWindow = globalThis.addEventListener.bind(globalThis)
  const addToDocument = document.addEventListener.bind(document)
  globalThis.addEventListener = ((
    type: string,
    handler: EventListenerOrEventListenerObject,
    opts?: AddEventListenerOptions | boolean,
  ) => {
    listeners.push([globalThis, type, handler])
    addToWindow(type, handler, opts)
  }) as typeof globalThis.addEventListener
  document.addEventListener = ((
    type: string,
    handler: EventListenerOrEventListenerObject,
    opts?: AddEventListenerOptions | boolean,
  ) => {
    listeners.push([document, type, handler])
    addToDocument(type, handler, opts)
  }) as typeof document.addEventListener

  vi.resetModules()

  try {
    const loaded = await import('./online.svelte')
    // Let the boot probe settle, so a test never races it.
    await vi.advanceTimersByTimeAsync(0)
    return loaded
  } finally {
    globalThis.addEventListener = addToWindow
    document.addEventListener = addToDocument
  }
}

/** Past the coalesce window, so consecutive foregrounds in a test read as separate resumes. */
const foreground = async (event = 'visibilitychange') => {
  if (event === 'visibilitychange') {
    document.dispatchEvent(new Event(event))
  } else {
    dispatchEvent(new Event(event))
  }

  await vi.advanceTimersByTimeAsync(600)
}

beforeEach(() => {
  vi.useFakeTimers()
  visibility('visible')
  onLineDescriptor ??= Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine')
})

afterEach(() => {
  for (const [target, type, handler] of listeners) {
    target.removeEventListener(type, handler)
  }

  listeners = []
  pending = []
  probe = 'hang'
  delete (navigator as unknown as Record<string, unknown>).onLine
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('the unreachable hold', () => {
  it('does not call the app offline the moment a connection drops', async () => {
    const online = await load()
    online.reportConnectionState({ name: 'connecting' })
    vi.advanceTimersByTime(9_000)

    // A normal reconnect passes through here. Firing early flashes "not downloaded" across every
    // screen for a blip nobody would otherwise notice.
    expect(online.isOnline()).toBe(true)
  })

  it('calls it offline once the drop has lasted', async () => {
    const online = await load()
    online.reportConnectionState({ name: 'connecting' })
    vi.advanceTimersByTime(11_000)

    expect(online.isOnline()).toBe(false)
  })

  it('is not restarted by a repeat of the same state', async () => {
    // Zero re-emits `connecting` every five seconds; treating each as news restarts a timer that
    // can then never fire, which is how the app once stayed "online" through an indefinite outage.
    const online = await load()
    online.reportConnectionState({ name: 'connecting' })
    vi.advanceTimersByTime(6_000)
    online.reportConnectionState({ name: 'connecting' })
    vi.advanceTimersByTime(6_000)

    expect(online.isOnline()).toBe(false)
  })

  it('is cancelled by reconnecting before it fires', async () => {
    const online = await load()
    online.reportConnectionState({ name: 'connecting' })
    vi.advanceTimersByTime(5_000)
    online.reportConnectionState({ name: 'connected' })
    vi.advanceTimersByTime(20_000)

    expect(online.isOnline()).toBe(true)
  })
})

describe('the hidden-tab gate', () => {
  it('does not call the app offline while the tab is in the background', async () => {
    // Zero drops the socket itself after five minutes out of sight. Believing that declared the app
    // offline on perfect wifi for anybody who pocketed their phone, which at a crag is everybody.
    const online = await load()
    visibility('hidden')
    online.reportConnectionState({ name: 'disconnected' })
    vi.advanceTimersByTime(60_000)

    expect(online.isOnline()).toBe(true)
  })

  it('still notices a real outage the tab was awake for', async () => {
    const online = await load()
    visibility('visible')
    online.reportConnectionState({ name: 'disconnected' })
    vi.advanceTimersByTime(11_000)

    expect(online.isOnline()).toBe(false)
  })
})

describe('states that are not about the network', () => {
  it('leaves the flag alone for a sync error rather than claiming a working connection', async () => {
    const online = await load()
    online.reportConnectionState({ name: 'connecting' })
    vi.advanceTimersByTime(11_000)
    expect(online.isOnline()).toBe(false)

    // `error` says the sync is broken, not that the network came back. Setting the flag true here
    // would have hidden the offline state behind a false claim of connectivity.
    online.reportConnectionState({ name: 'error' })
    vi.advanceTimersByTime(11_000)
    expect(online.isOnline()).toBe(false)
  })

  it('takes needs-auth as proof the network works, because only a server can produce it', async () => {
    const online = await load()
    online.reportConnectionState({ name: 'connecting' })
    vi.advanceTimersByTime(11_000)
    expect(online.isOnline()).toBe(false)

    // Zero will not retry out of `needs-auth` unaided, so without this the flag stayed false for as
    // long as the token stayed stale, telling somebody on perfect wifi that they were offline.
    online.reportConnectionState({ name: 'needs-auth' })
    expect(online.isOnline()).toBe(true)
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
  it('does not let a failed probe outrank a live socket', async () => {
    const online = await load()
    online.reportConnectionState({ name: 'connected' })

    probe = 'fail'
    dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(0)

    expect(online.isOnline()).toBe(true)
  })

  it('still settles an offline start in one request', async () => {
    // The probe exists so a cold start on a dead network renders its offline state immediately
    // instead of spinning for the ten-second hold.
    const online = await load({ probe: 'fail' })

    expect(online.isOnline()).toBe(false)
  })

  it('settles an offline start before any connection has ever reported', async () => {
    // The only signal on a route with no Zero client, so its verdict has to land without one.
    const online = await load({ probe: 'fail' })
    vi.advanceTimersByTime(60_000)

    expect(online.isOnline()).toBe(false)
  })

  it('clears the flag when the connection reports in, with or without a transition', async () => {
    const online = await load({ probe: 'fail' })
    expect(online.isOnline()).toBe(false)

    online.reportConnectionState({ name: 'connected' })
    expect(online.isOnline()).toBe(true)

    // And again with no change of name: `connected` is documented as the one input that clears the
    // flag unconditionally, so it must not depend on having transitioned to get there.
    online.reportConnectionState({ name: 'connected' })
    expect(online.isOnline()).toBe(true)
  })

  it('ignores a probe that answers about a moment which has already passed', async () => {
    // An unaborted probe issued before a drop can reject long after, writing a verdict about the
    // wrong moment: a false offline on a network that is by then fine.
    const online = await load()
    online.reportConnectionState({ name: 'connecting' })

    probe = 'hang'
    await foreground()
    const stale = pending.at(-1)
    expect(stale).toBeDefined()

    probe = 'ok'
    await foreground()

    stale?.reject()
    await vi.advanceTimersByTimeAsync(0)

    expect(online.isOnline()).toBe(true)
  })
})

describe('re-asking while offline', () => {
  it('recovers with no resume and no browser event at all', async () => {
    // The network can return with no `online` event and no resume, and nothing else re-asks.
    const online = await load({ probe: 'fail' })
    expect(online.isOnline()).toBe(false)

    probe = 'ok'
    await vi.advanceTimersByTimeAsync(6_000)

    expect(online.isOnline()).toBe(true)
  })

  it('stops asking once the network answers', async () => {
    const online = await load({ probe: 'fail' })
    probe = 'ok'
    await vi.advanceTimersByTimeAsync(6_000)
    expect(online.isOnline()).toBe(true)

    probe = 'hang'
    pending = []
    await vi.advanceTimersByTimeAsync(120_000)

    expect(pending).toHaveLength(0)
  })

  it('stops asking when the answer is a sync outage rather than a dead network', async () => {
    // A succeeding probe that leaves the flag false means the sync is down, which re-asking cannot mend.
    const online = await load({ probe: 'fail' })
    online.reportConnectionState({ name: 'connecting' })

    probe = 'ok'
    await vi.advanceTimersByTimeAsync(6_000)
    expect(online.isOnline()).toBe(false)

    pending = []
    probe = 'hang'
    await vi.advanceTimersByTimeAsync(120_000)

    expect(pending).toHaveLength(0)
  })

  it('acquits a connection that proved the network, even one that is not `connected`', async () => {
    // Gating both branches on the literal `connected` condemned a `needs-auth` socket for good.
    const online = await load({ probe: 'fail' })
    online.reportConnectionState({ name: 'needs-auth' })
    expect(online.isOnline()).toBe(true)

    probe = 'fail'
    dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(0)
    expect(online.isOnline()).toBe(false)

    probe = 'ok'
    await vi.advanceTimersByTimeAsync(6_000)

    expect(online.isOnline()).toBe(true)
  })

  it('stops asking when the connection reports in instead', async () => {
    // Zero got there first. The armed retry has nothing left to find out.
    const online = await load({ probe: 'fail' })
    online.reportConnectionState({ name: 'connected' })

    pending = []
    probe = 'hang'
    await vi.advanceTimersByTimeAsync(120_000)

    expect(pending).toHaveLength(0)
  })

  it('starts the backoff over once the network has answered', async () => {
    // Without the reset a flaky link walks out to the longest step and stays there.
    const online = await load({ probe: 'fail' })
    probe = 'ok'
    await vi.advanceTimersByTimeAsync(6_000)
    expect(online.isOnline()).toBe(true)

    // Fail once more, from a fresh probe rather than an armed retry.
    probe = 'fail'
    dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(0)
    expect(online.isOnline()).toBe(false)

    pending = []
    probe = 'hang'
    await vi.advanceTimersByTimeAsync(5_500)

    // The first step again (5s), not the second (10s).
    expect(pending).toHaveLength(1)
  })

  it('does not wake the radio for a tab nobody is looking at', async () => {
    await load({ probe: 'fail' })

    visibility('hidden')
    pending = []
    probe = 'hang'
    await vi.advanceTimersByTimeAsync(120_000)

    expect(pending).toHaveLength(0)
  })
})

describe('the navigator.onLine latch', () => {
  /**
   * `navigator.onLine` is read once at module load and afterwards only moved by transition events.
   * A false reading at startup - routine for an iOS home-screen web app, whose network attaches
   * after the web view boots - therefore stuck forever: no `online` event fires, because from the
   * browser's point of view nothing changed. A freshly installed PWA synced its whole guidebook and
   * still showed "You're offline".
   */
  it('starts offline when the browser already claims to be', async () => {
    // The probe must not answer here, or this passes on the probe's verdict rather than on the read.
    const online = await load({ onLine: false, probe: 'hang' })

    expect(online.isOnline()).toBe(false)
  })

  it('lets a live socket override a browser that claims to be offline', async () => {
    const online = await load({ onLine: false, probe: 'hang' })
    expect(online.isOnline()).toBe(false)

    // Zero has a socket to the server, which is proof the network works whatever the browser says.
    online.reportConnectionState({ name: 'connected' })
    expect(online.isOnline()).toBe(true)
  })

  it('does not let a foreground replay override a browser that says it is offline', async () => {
    // A socket not heard from since the suspension is not evidence, and overriding a delivered
    // `offline` event with it is what made a form rethrow and lose everything typed.
    const online = await load()
    online.reportConnectionState({ name: 'connected' })

    dispatchEvent(new Event('offline'))
    expect(online.isOnline()).toBe(false)

    await foreground()
    expect(online.isOnline()).toBe(false)
  })
})

describe('the foreground replay', () => {
  it('re-arms a hold that was skipped while the tab was hidden', async () => {
    // A client parked in `disconnected` emits nothing further, so the skipped hold never restarts.
    const online = await load()
    visibility('hidden')
    online.reportConnectionState({ name: 'disconnected' })
    vi.advanceTimersByTime(60_000)
    expect(online.isOnline()).toBe(true)

    visibility('visible')
    await foreground()
    vi.advanceTimersByTime(11_000)

    expect(online.isOnline()).toBe(false)
  })

  it('does not arm a hold on a route where no connection has ever reported', async () => {
    // `initZero` runs only in `(app)`, so nothing reports on `(landing)`. Replaying an initial
    // `connecting` armed the hold and latched the flag false on a perfect network.
    const online = await load({ probe: 'ok' })

    await foreground()
    vi.advanceTimersByTime(60_000)

    expect(online.isOnline()).toBe(true)
  })

  it('lets the network coming back clear a connection it denied, with no new report', async () => {
    // Zero parked in `connected` never reports again, so nothing could clear a probe's denial: the
    // app sat on "You're offline" with a live socket until it was reloaded.
    const online = await load()
    online.reportConnectionState({ name: 'connected' })

    probe = 'fail'
    await foreground()
    expect(online.isOnline()).toBe(false)

    probe = 'ok'
    dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(0)

    expect(online.isOnline()).toBe(true)
  })

  it('recovers on a route where nothing ever reports, once the network answers again', async () => {
    // On `(landing)` the probe is the only signal, so one that condemns but never acquits leaves
    // every auth and marketing page offline for good after a single blip.
    const online = await load({ probe: 'fail' })
    expect(online.isOnline()).toBe(false)

    probe = 'ok'
    dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(0)

    expect(online.isOnline()).toBe(true)
  })

  it('does not let a working network paper over a sync outage', async () => {
    // The app server answering says nothing about zero-cache; a sync outage reads as offline on purpose.
    const online = await load()
    online.reportConnectionState({ name: 'disconnected' })
    vi.advanceTimersByTime(11_000)
    expect(online.isOnline()).toBe(false)

    probe = 'ok'
    dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(0)

    expect(online.isOnline()).toBe(false)
  })

  it.each(['pageshow', 'focus'])('re-asks the network on %s too, not only on visibilitychange', async (event) => {
    // An installed iOS web app tracked the network on a cold boot and never again with
    // `visibilitychange` alone, so all three events drive the same handler.
    const online = await load()
    online.reportConnectionState({ name: 'connected' })
    expect(online.isOnline()).toBe(true)

    probe = 'fail'
    await foreground(event)

    expect(online.isOnline()).toBe(false)
  })

  it('acts on a later resume, not only the first', async () => {
    // A latch that never reopens drops every resume after the first.
    const online = await load()
    online.reportConnectionState({ name: 'connected' })

    probe = 'fail'
    await foreground()
    expect(online.isOnline()).toBe(false)

    probe = 'ok'
    await foreground()

    expect(online.isOnline()).toBe(true)
  })

  it('treats one resume as one resume, however many of the three events it fires', async () => {
    const online = await load()
    online.reportConnectionState({ name: 'connecting' })

    probe = 'hang'
    pending = []
    document.dispatchEvent(new Event('visibilitychange'))
    dispatchEvent(new Event('pageshow'))
    dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(0)

    // One probe in flight, not three: the others were coalesced away.
    expect(pending).toHaveLength(1)
  })

  it('does not let a connection frozen by a suspension outrank a failed probe', async () => {
    // Suspended mid-`connected`, radio dies while away: on resume the frozen state must not
    // discard the probe that just proved there is no network.
    const online = await load()
    online.reportConnectionState({ name: 'connected' })
    expect(online.isOnline()).toBe(true)

    probe = 'fail'
    await foreground()

    expect(online.isOnline()).toBe(false)
  })
})
