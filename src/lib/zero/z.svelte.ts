import { dev } from '$app/environment'
import { PUBLIC_ZERO_URL } from '$env/static/public'
import { recordResume } from '$lib/logging/resumeLog'
import { powerSyncOnly } from '$lib/powersync/db.svelte'
import { reportConnectionState, setPingTightenHandler } from '$lib/state/online.svelte'
import { forgetSynced } from '$lib/state/sync.svelte'
import type { Session } from '@supabase/supabase-js'
import { Z } from 'zero-svelte'
import type { ConnectionName } from './connection'
import { mutators } from './mutators'
import { queries } from './queries'
import { schema, type Schema } from './zero-schema'

// The current Zero client, scoped to the signed-in user. `$state.raw` so that
// replacing the instance (login/logout) re-runs every `$derived` that read it
// through `getZ()`: resources re-target their queries onto the new client.
let instance = $state.raw<undefined | Z<Schema>>(undefined)

// The token last handed to the client, to detect Supabase token refreshes.
let accessToken: string | undefined

// Drops the previous client's connection-state subscription when a new client replaces it.
let connectionUnsubscribe: (() => void) | undefined

/**
 * The current Zero client. Reactive: reading it inside `$derived`/`$effect`
 * subscribes to client swaps. Only available after the root layout load ran.
 */
export function getZ(): Z<Schema> {
  if (instance == null) {
    throw new Error('Zero is not initialized: initZero(session) must run in the root layout load first')
  }

  return instance
}

/**
 * Creates (or reuses) the Zero client for the given session. Called from the
 * root layout load, which re-runs on `supabase:auth` invalidation: the client
 * is only swapped when the signed-in user changed.
 */
export function initZero(session: null | Session | undefined): Z<Schema> {
  const userID = session?.user.id

  // Reused, not rebuilt: rebuilding here would re-target every query, resetting
  // `QueryResource.settled` and tearing down every open edit form mid-edit.
  if (instance != null && instance.userID === userID) {
    if (session != null && accessToken !== session.access_token) {
      accessToken = session.access_token
      // Stores the refreshed token for future reconnects and resumes the
      // connection if it is stuck in `needs-auth` or `error`.
      void instance.connection.connect({ auth: accessToken })
    }

    return instance
  }

  accessToken = session?.access_token
  instance?.close()

  const z = new Z<Schema>(zeroOptions(session))
  instance = z
  // The measurement build: a local-only client in memory, so the screens still on Zero render their
  // needs-a-connection state while PowerSync alone syncs.
  if (powerSyncOnly()) return z

  // Zero is the only thing in the app continuously trying to reach the server, which makes it the
  // only honest answer to "are we online". `navigator.onLine` alone says yes on a fresh document
  // load with the network already dead, so without this every offline affordance in the app stays
  // switched off exactly when it is needed. See `$lib/state/online.svelte`.
  //
  // The unsubscribe is kept and called on the next swap, so only ever one client reports. That flag
  // is written level-triggered, so two live clients flapping out of step would fight over it.
  connectionUnsubscribe?.()
  let lastState: ConnectionName | undefined
  connectionUnsubscribe = z.connection.state.subscribe((state) => {
    reportConnectionState(state)
    noteConnectionForResume(state.name)
    // Signed in only: the barrier is a member query, and a logged-out client's run throws inside
    // Zero's state listener, which aborts the connect.
    if (state.name === 'connected' && lastState !== 'connected' && session != null) {
      armSyncBarrier(z)
    }
    lastState = state.name
  })

  // Zero takes 2x `pingTimeoutMs` to notice a socket that died while the app was backgrounded, which
  // on its default is ten seconds of rendering stale rows while reporting `connected`. Nothing in
  // this app can see that state, so the only lever is making Zero look sooner, and only where a
  // just-answered probe makes a short pong deadline safe. See `shouldTightenPing`.
  setPingTightenHandler(() => tightenPing(z))

  if (dev) {
    // Sync failures are invisible from the outside: the app only renders a spinner or stale rows,
    // and `connectionState` is otherwise only reachable through a component. Costs nothing in a
    // production build, and this is the first thing to read when "it will not load".
    //
    // `__grnyte` and not `__zero`: Zero installs itself on `window.__zero` (see `zero.js`, it only
    // claims the name when it is free), so assigning over it would take away its own inspector to
    // put ours in the same place. Both are worth having.
    Object.assign(window, {
      __grnyte: {
        get connectionState() {
          return z.connectionState
        },
        get context() {
          return z.context
        },
        /**
         * Run any query from the registry against the local store, by name.
         *
         * `__grnyte.query('area', { id: 594 })`. The one question worth asking when a screen is
         * empty is whether the rows are on this device, and there is otherwise no way to ask it:
         * the replica is opaque from the console and a component's resource cannot be reached
         * from outside its tree. Offline it is the only tool there is.
         */
        query: (name: keyof typeof queries, args?: unknown) =>
          // The registry is a union of query factories with unrelated argument types; a debug
          // helper that takes a name off the console cannot be typed against that.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          z.run((queries[name] as any)(args)),
        reconnect: () => z.connection.connect(accessToken == null ? undefined : { auth: accessToken }),
        get userID() {
          return z.userID
        },
        watch: (name: keyof typeof queries, args?: unknown, ms = 5000) =>
          new Promise((resolve) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const view = z.materialize((queries[name] as any)(args))
            const seen: unknown[] = []
            view.addListener((snap: unknown, type: unknown) => {
              seen.push({ n: Array.isArray(snap) ? snap.length : snap == null ? null : 1, type })
            })
            setTimeout(() => {
              view.destroy()
              resolve(seen)
            }, ms)
          }),
      },
    })
  }

  return z
}

let caughtUp = $state(false)
let barrier = 0

/** Whether this connection caught up with the server. Not `complete`, which a reconnect reports at
 *  once for a query hash Zero already holds, with last session's rows. */
export function syncCaughtUp(): boolean {
  return caughtUp
}

function armSyncBarrier(z: Z<Schema>): void {
  const generation = ++barrier
  caughtUp = false
  const nonce = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  // A failed barrier proves nothing either way, so it stops claiming the sync is behind.
  const settle = () => {
    if (generation === barrier) caughtUp = true
  }
  void z.run(queries.syncBarrier({ nonce }), { ttl: 'none', type: 'complete' }).then(settle, settle)
}

/**
 * Detection is 2x this only for a ping cycle that STARTS after tightening. `sleepWithAbort` captures
 * the value, so an idle sleep already in flight keeps its old deadline: ~4s at best, ~10s at worst.
 */
const RESUME_PING_TIMEOUT_MS = 2_000

/**
 * One ping cycle plus margin. Zero idles `pingTimeoutMs`, then uses the SAME value as the pong
 * deadline, so a tight value left in place keeps cutting a live link whose round trip is slower.
 */
const TIGHT_PING_WINDOW_MS = RESUME_PING_TIMEOUT_MS * 2 + 1_000

/**
 * How long a resume stays open waiting for a drop. Deliberately NOT the ping window, which is far
 * shorter: a disconnect can land after that closes, and nulling early loses the slow reconnect.
 */
const RESUME_LOG_WINDOW_MS = 30_000

let restorePingTimer: null | ReturnType<typeof setTimeout> = null
let resumeExpiryTimer: null | ReturnType<typeof setTimeout> = null
let pingTimeoutBeforeTightening = 0

/** The open resume: when it happened, and whether the connection has dropped since. Null once it
 *  has been recorded or the window closed without one, so a healthy resume records nothing. */
let openResume: null | { droppedSince: boolean; startedAt: number } = null

/**
 * Record a resume only once the connection has actually come back from a drop.
 *
 * The drop is what makes it worth knowing about: a resume onto a live socket is the ordinary case
 * and writes nothing, so the entry count is itself the answer to how often this happens.
 */
function noteConnectionForResume(name: ConnectionName): void {
  if (openResume == null) {
    return
  }

  if (name !== 'connected') {
    openResume.droppedSince = true
    return
  }

  if (openResume.droppedSince) {
    recordResume({ at: openResume.startedAt, elapsedMs: Date.now() - openResume.startedAt })
    openResume = null
  }
}

/**
 * Shorten Zero's ping cycle for one window after a resume, then put it back.
 *
 * Restores the value that was there rather than a literal, so Zero's default stays Zero's to choose.
 * A window rather than waiting for a reconnect, because the healthy case never reconnects: the ping
 * goes out early, the pong comes back, and nothing else happens.
 */
function tightenPing(z: Z<Schema>): void {
  // `current` is deprecated, and is still the only route: zero-svelte forwards neither
  // `pingTimeoutMs` nor `ttl` from the client it wraps. Typed, so losing either fails the build.
  const client = z.current

  if (restorePingTimer == null) {
    pingTimeoutBeforeTightening = client.pingTimeoutMs
  } else {
    clearTimeout(restorePingTimer)
  }

  client.pingTimeoutMs = RESUME_PING_TIMEOUT_MS
  openResume = { droppedSince: false, startedAt: Date.now() }

  restorePingTimer = setTimeout(() => {
    restorePingTimer = null
    client.pingTimeoutMs = pingTimeoutBeforeTightening
  }, TIGHT_PING_WINDOW_MS)

  if (resumeExpiryTimer != null) {
    clearTimeout(resumeExpiryTimer)
  }

  resumeExpiryTimer = setTimeout(() => {
    resumeExpiryTimer = null

    // Only a resume that never dropped was healthy. One that has is still waiting on the reconnect
    // this log exists to time, however long that takes.
    if (openResume?.droppedSince === false) {
      openResume = null
    }
  }, RESUME_LOG_WINDOW_MS)
}

function zeroOptions(session: null | Session | undefined) {
  return {
    auth: session?.access_token,
    context: session == null ? undefined : { authUserId: session.user.id },
    mutators,
    // Zero's own signal that the local sync state is gone: garbage collected after a long absence,
    // or rejected by zero-cache. Dropping the stamp is what lets the layout tell a wiped store from
    // a first visit.
    //
    // The reload is not optional. Zero's default behaviour for this callback IS a reload, and
    // supplying a handler replaces it rather than adding to it, so returning without one leaves the
    // client running against state the server has already disowned: connected, and permanently
    // empty. `location.reload()` is what the default would have done anyway.
    onClientStateNotFound: () => {
      forgetSynced()
      location.reload()
    },
    schema,
    ...(powerSyncOnly() ? { kvStore: 'mem' as const, server: null } : { server: PUBLIC_ZERO_URL }),
    // `undefined` rather than `'anon'` for logged-out clients. Zero 1.4 deprecated the sentinel
    // ahead of the client-group security work in 1.5, and a real user id is the only thing that may
    // appear here. It also changes the IndexedDB key for logged-out clients, so they get one cold
    // replica on the way past.
    userID: session?.user.id,
  }
}
