import { browser } from '$app/environment'
import { base } from '$app/paths'

/**
 * Whether the app can actually reach anything.
 *
 * Two signals, because neither is sufficient on its own.
 *
 * `navigator.onLine` is only trusted when it is **false**: false negatives do not happen, false
 * positives happen constantly. A joined wifi with no route, a captive portal, and a bar of signal
 * with no usable data all read as online, and the last one is the normal state at a crag, which is
 * the whole case this app exists to serve. It is also true on a fresh document load with the network
 * already dead: the flag only flips when the `offline` event fires, and a page that was not open to
 * hear it starts out believing it is connected. That is why a refresh behaves differently from
 * toggling the network on an open tab, and it is not something a listener can fix.
 *
 * So the second signal is Zero's own connection, reported in by `initZero`. Zero is the only thing
 * in the app continuously trying to reach the server, and it knows within one retry whether that
 * works. When it has been unable to connect for {@link UNREACHABLE_HOLD_MS}, we are offline no
 * matter what the browser claims.
 *
 * That hold is far too slow to be the answer at startup, though: it leaves several seconds in which
 * an offline page renders as if it were merely loading, which is the window where a reference shows
 * its raw `!blocks:12!` token and the save button spins. So a third signal runs once at boot, see
 * {@link probeReachability}, and settles it in about a millisecond.
 *
 * The known cost: a sync-server outage on a perfectly good connection now reads as "you're offline"
 * rather than "not syncing". From the client the two are the same failed socket, and separating them
 * would take a second probe against the app server. Taken deliberately, because the errors are not
 * symmetric: getting it wrong during an outage is wrong copy over data that still renders from the
 * local store, and getting it wrong at a crag is an app that spins forever with no explanation, on
 * the one day it was the reason for keeping the data at all.
 *
 * One module rather than a copy per component. Four surfaces hand-rolled the listener pair before
 * the offline work, and the convention above only holds if there is one place to keep it.
 */

/**
 * How long Zero must fail to connect before the app calls itself offline.
 *
 * Zero retries every five seconds and flaps through `connecting` on token refresh and tab wake, so
 * anything shorter turns a normal reconnect into a flash of "not downloaded" across the screen. The
 * same value as `StatusBar`'s transient hold on purpose: the bar and the screen behind it must not
 * disagree about whether there is a connection.
 */
const UNREACHABLE_HOLD_MS = 10_000

/**
 * States Zero does not recover from by retrying (see `StatusBar`). They mean the sync is broken, not
 * that the network is down, and they get their own red bar telling the reader to reload. Calling
 * them "offline" would send somebody looking for signal when the problem is their token.
 *
 * `error` and `closed` say nothing about the network, so they leave the flag exactly as they found
 * it. Setting it true would be the same false-positive this module exists to prevent.
 */
const TERMINAL = ['closed', 'error', 'needs-auth']

let online = $state(true)
let reachable = $state(true)
let reported: string | undefined
let timer: null | ReturnType<typeof setTimeout> = null

if (browser) {
  online = navigator.onLine
  addEventListener('offline', () => (online = false))
  // The browser saying the network is back is a reason to re-check, not proof: this is exactly the
  // event a captive portal fires when you associate with it.
  addEventListener('online', () => {
    online = true
    void probeReachability()
  })
  // A tab returning to the foreground has missed whatever happened while it was away, including its
  // own socket being closed on purpose, and Zero may not change state again to tell us. Re-ask.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void probeReachability()
    }
  })
  void probeReachability()
}

/**
 * What one of Zero's connection states says about the *network*, which is not the same question as
 * what it says about the sync.
 *
 * Pure, and exported, because these three lines are the whole judgement and every one of them has
 * shipped as a bug: `disconnected` counted as evidence when a hidden tab is disconnected on purpose;
 * `needs-auth` set the flag true when it should have been untouched, and later untouched when it
 * should have been true. None of that was assertable while it lived inside a function that also owns
 * a timer and two pieces of module state. Same shape as `StatusBar`'s `resolveStatus`.
 *
 * - `reachable`: something answered. Proof the network works.
 * - `no-evidence`: says nothing either way; leave the flag where it stands.
 * - `unreachable`: consistent with a dead network, but only after {@link UNREACHABLE_HOLD_MS},
 *   because a normal reconnect passes through here too.
 */
export function connectionVerdict(name: string): 'no-evidence' | 'reachable' | 'unreachable' {
  // Connected is proof, and it is the most direct proof there is.
  if (name === 'connected') {
    return 'reachable'
  }

  // `needs-auth` is proof too, less obviously. Zero only enters it on an error parsed off the wire
  // (`isAuthError` is gated on a server-origin protocol error), which a dead network cannot produce
  // and a captive portal cannot forge: a portal can answer an HTTP probe with a 200, but not mint a
  // Zero protocol frame, so it fails the socket and lands in `disconnected` instead. It is also the
  // one state Zero will not retry out of unaided, so without this the flag would stay false for as
  // long as the token stays stale, telling somebody on perfect wifi they are offline.
  //
  // The answer may come from zero-cache rather than our own app (a 401/403 on its call to
  // `get-queries` raises this too), so it means "something upstream answered", not specifically
  // "your token is bad" - enough for a network signal, too vague to key user-facing copy on.
  if (name === 'needs-auth') {
    return 'reachable'
  }

  // The other two terminal states are a broken sync on a network that may be perfectly fine.
  if (TERMINAL.includes(name)) {
    return 'no-evidence'
  }

  return 'unreachable'
}

/** Reactive. Reading this inside `$derived`/`$effect` subscribes to connectivity changes. */
export function isOnline(): boolean {
  return online && reachable
}

/**
 * Feeds Zero's connection state in. `initZero` subscribes for the lifetime of a client and drops the
 * subscription when it swaps one, so only ever one client reports here.
 *
 * Not every disconnect is a network problem, and the two that are not both had to be found the hard
 * way:
 * - **A hidden tab is disconnected on purpose.** Zero drops the socket after five minutes in the
 *   background (`DEFAULT_DISCONNECT_HIDDEN_DELAY_MS`) and reports `disconnected` with
 *   `reason.kind === 'Hidden'`. Treating that as evidence made the app declare itself offline on
 *   perfect wifi for anybody who put their phone in a pocket, which at a crag is everybody.
 * - **Terminal states are a broken sync, not a broken network.** See {@link TERMINAL}.
 */
export function reportConnectionState(state: { name: string }): void {
  // Only a *change* is acted on. Zero re-emits the same state on every retry, five seconds apart,
  // so treating each emission as news means the ten-second hold below is restarted before it can
  // ever fire and the app never notices it is offline. The name is the whole signal: `reason` is an
  // opaque message string in the public type and differs between otherwise identical retries.
  if (state.name === reported) {
    return
  }

  reported = state.name

  if (timer != null) {
    clearTimeout(timer)
    timer = null
  }

  const verdict = connectionVerdict(state.name)

  if (verdict === 'reachable') {
    reachable = true
    return
  }

  if (verdict === 'no-evidence') {
    return
  }

  timer = setTimeout(() => {
    // A backgrounded tab is disconnected on purpose: Zero drops the socket after five minutes out of
    // sight (`DEFAULT_DISCONNECT_HIDDEN_DELAY_MS`). Believing that would have declared the app
    // offline on perfect wifi for anybody who pocketed their phone, which at a crag is everybody.
    //
    // Gated on visibility rather than on the disconnect's reason, which the public `ConnectionState`
    // flattens to a message string this has no business matching against. A hidden tab has no
    // interface to be wrong in front of, and `visibilitychange` above re-probes when it comes back.
    if (document.visibilityState !== 'visible') {
      return
    }

    reachable = false
  }, UNREACHABLE_HOLD_MS)
}

/**
 * One request whose only job is to find out whether requests work.
 *
 * Answers in about a millisecond, because offline a `fetch` fails at the network layer rather than
 * timing out, and that speed is the entire point: it lands before the first paint, so an offline
 * start renders its offline state immediately instead of spending Zero's ten-second hold pretending
 * to load.
 *
 * **Only ever sets `false`,** and that asymmetry is the point rather than caution. A response is not
 * evidence of a working connection: a captive portal answers this request with its own login page
 * and a cheerful 200, which is precisely the network this module exists to catch. Only Zero
 * reaching the sync server proves anything, so clearing the flag stays Zero's job.
 *
 * The query string is load-bearing. `_app/version.json` is in the precache manifest, so requesting
 * it plainly is answered by the service worker from Cache Storage with a cheerful 200 while the
 * network is dead - measured, not assumed. Workbox only ignores `utm_*` and `fbclid` when matching a
 * precached URL, so any other parameter misses the cache and goes to the network, which is what we
 * need to test.
 *
 * The status code is not read, and must not be: what is being tested is whether a request reaches a
 * server at all, so a 404 is as good an answer as a 200. It is a 404 in dev, where the file is a
 * build artefact that does not exist yet, and that is fine.
 */
async function probeReachability(): Promise<void> {
  try {
    await fetch(`${base}/_app/version.json?reachability=${Date.now()}`, { cache: 'no-store' })
  } catch {
    reachable = false
  }
}
