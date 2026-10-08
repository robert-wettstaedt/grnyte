import { dev } from '$app/environment'
import { PUBLIC_ZERO_URL } from '$env/static/public'
import { recordResume } from '$lib/logging/resumeLog'
import { isFieldDevice } from '$lib/state/device.svelte'
import { reportConnectionState, setPingTightenHandler } from '$lib/state/online.svelte'
import { forgetSynced, markStoreLoaded, markSynced, trackSyncFor } from '$lib/state/sync.svelte'
import type { Session } from '@supabase/supabase-js'
import { Z } from 'zero-svelte'
import { FIELD_STAGES, KEPT, type KeepContext, type KeepStage } from './offline'
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
 * A throwaway client with its own empty replica, so `/bench` can time a cold
 * initial sync without disturbing the app's client or its IndexedDB. The caller
 * owns the lifecycle: `close()` it and drop the database named by `storageKey`.
 */
export function createColdZero(session: Session, storageKey: string): Z<Schema> {
  return new Z<Schema>(zeroOptions(session, storageKey))
}

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
  trackSyncFor(userID)

  // Zero is the only thing in the app continuously trying to reach the server, which makes it the
  // only honest answer to "are we online". `navigator.onLine` alone says yes on a fresh document
  // load with the network already dead, so without this every offline affordance in the app stays
  // switched off exactly when it is needed. See `$lib/state/online.svelte`.
  //
  // The unsubscribe is kept and called on the next swap, so only ever one client reports. That flag
  // is written level-triggered, so two live clients flapping out of step would fight over it.
  connectionUnsubscribe?.()
  let lastState: string | undefined
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

  storeProbe?.destroy()
  storeProbe = undefined
  if (session != null) {
    // The signed-in user always has a row, so seeing it local proves the replica was read back.
    const probe = z.materialize(queries.currentUser())
    storeProbe = probe
    probe.addListener((data) => {
      if (Array.isArray(data) ? data.length > 0 : data != null) {
        markStoreLoaded()
        queueMicrotask(() => probe.destroy())
        if (storeProbe === probe) storeProbe = undefined
      }
    })

    // Eagerly sync app-wide reference data and the signed-in user into the
    // local store so resources reading them (see $lib/state/global.svelte)
    // render immediately rather than flashing a loading state.
    //
    // No `catch`: Zero's `complete` promise resolves or stays pending, it does not reject, so a
    // handler here could only ever be dead code. Offline the whole chain never settles,
    // which is the correct outcome - `markSynced` must not fire for a sync that did not happen.
    const ctx = keepContext(z)
    // The stamp says the shell can render, and nothing about the guidebook still arriving.
    void preloadStage(z, KEPT.reference, ctx).then(() => {
      // Only now: a client group's queries are answered as one batch, so issued beside these the
      // guidebook held the first screen back for its whole ~12 s hydration.
      preloadForOffline(z, ctx)
    })
  }

  instance = z

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
        /**
         * Time a registry query end to end on a COLD client: server execution, CVR build,
         * transfer and local ingest, with nothing already in the replica.
         *
         * `await __grnyte.bench('listEvents', [{ limit: 50 }, { limit: 20 }, { limit: 10 }])`
         *
         * Each sample gets its own throwaway client and IndexedDB, because a warm replica answers
         * locally and would time nothing. `listGrades` is measured the same way as a baseline: the
         * same connect, auth and client-group setup with a query that costs nothing, so the
         * difference is the query under test rather than the handshake in front of it.
         */
        bench: async (name: keyof typeof queries, argsList: unknown[] = [undefined], runs = 3) => {
          if (session == null) {
            return 'not signed in'
          }

          // Captured so the null check above narrows inside `once`, which is a nested closure.
          const active = session
          const keys: string[] = []

          const once = async (queryName: keyof typeof queries, args: unknown) => {
            const key = `bench-${keys.length}-${queryName}`
            keys.push(key)
            const cold = createColdZero(active, key)
            const start = performance.now()
            // The registry is a union of factories with unrelated argument types.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const rows = await cold.run((queries[queryName] as any)(args), { type: 'complete' })
            const ms = performance.now() - start
            cold.close()
            return { ms, rows: Array.isArray(rows) ? rows.length : rows == null ? 0 : 1 }
          }

          const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]

          const table: Record<string, unknown>[] = []

          for (const label of ['baseline', ...argsList.map((a) => JSON.stringify(a))]) {
            const isBaseline = label === 'baseline'
            const samples: number[] = []
            let rows = 0

            for (let i = 0; i < runs; i++) {
              const r = isBaseline ? await once('listGrades', undefined) : await once(name, argsList[table.length - 1])
              samples.push(r.ms)
              rows = r.rows
            }

            table.push({
              args: label,
              median: Math.round(median(samples)),
              rows,
              samples: samples.map((ms) => Math.round(ms)),
            })
          }

          // The throwaway replicas are real IndexedDB databases; left behind they accumulate one
          // per sample and the next run measures a browser with a hundred dead stores.
          const dbs = (await indexedDB.databases?.()) ?? []
          for (const db of dbs) {
            if (db.name != null && keys.some((key) => db.name?.includes(key))) {
              indexedDB.deleteDatabase(db.name)
            }
          }

          console.table(table)
          return table
        },
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

let storeProbe: undefined | { destroy(): void }

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

/** The lookups kept queries take their arguments from, each run once per sync. */
function keepContext(z: Z<Schema>): KeepContext {
  let user: Promise<number | undefined> | undefined
  let regions: Promise<number[]> | undefined
  return {
    regionFks: () =>
      (regions ??= z
        .run(queries.listUserRegions(), { type: 'complete' })
        .then((memberships) => memberships.map((membership) => membership.regionFk))),
    userId: () => (user ??= z.run(queries.currentUser(), { type: 'complete' }).then((row) => row?.id ?? undefined)),
  }
}

/**
 * Keeps the guidebook in the local store, plus your own logbook and your regions' members, so the
 * guidebook is readable with no signal. "Guidebook" is the corpus describing the rock (see
 * CONTEXT.md); the other two ride along because the screens that render it need them, not because
 * they are part of it.
 *
 * `preload()` and never `cleanup()`, and the "never" is the whole mechanism. A preload's TTL governs
 * how long its rows survive *after* `cleanup()` is called (see `PreloadOptions` in Zero's
 * `query.d.ts`); while the preload is live the rows are kept. So retention here rests on
 * nothing calling `cleanup`, which no test asserts and any refactor could quietly undo.
 *
 * TTL is not the lever it looks like either way: `MAX_TTL_MS` caps it at ten minutes and
 * `ttl: 'forever'` is silently clamped to that. An earlier version of this comment credited the
 * clamp with the retention, which was the right conclusion off the wrong mechanism.
 *
 * Four weeks away costs nothing for *reading*, but not for reconnecting: zero-cache garbage
 * collects an inactive CVR after 48 hours, so any gap longer than that comes back through
 * `onClientStateNotFound`, which drops the sync stamp and reloads into a fresh sync.
 *
 * WHAT is kept, and how each request is built, lives in `KEPT` in `offline.ts`, the same table every
 * screen reads its offline policy from. This function only decides when each stage starts.
 */
function preloadForOffline(z: Z<Schema>, ctx: KeepContext): void {
  if (!isFieldDevice()) {
    return
  }

  // The guidebook's stamp is what lets a screen offline treat an empty result as an answer, so it
  // waits for every guidebook table rather than for the reference stamp, which lands seconds sooner.
  for (const stage of FIELD_STAGES) {
    void preloadStage(z, stage, ctx)
  }
}

/** Preloads one stage of `KEPT`, stamping it once every query in it is complete. A failed lookup
 *  costs its own query and the stamp, never the rest of the stage. */
async function preloadStage(z: Z<Schema>, stage: KeepStage, ctx: KeepContext): Promise<void> {
  let failed = false
  await Promise.all(
    Object.entries(stage.queries).map(async ([name, build]) => {
      try {
        const request = await build(ctx)
        if (request != null) {
          await z.preload(request as Parameters<typeof z.preload>[0]).complete
        }
      } catch (error) {
        failed = true
        console.error(`Error preloading ${name} for offline use:`, error)
      }
    }),
  )
  if (!failed && stage.stamp != null) {
    markSynced(stage.stamp)
  }
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
function noteConnectionForResume(name: string): void {
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

/**
 * The options every Zero client in this app is built from. Shared so the
 * throwaway client `createColdZero` hands to the benchmark cannot drift from
 * the real one and quietly measure a different configuration.
 */
function zeroOptions(session: null | Session | undefined, storageKey?: string) {
  return {
    auth: session?.access_token,
    context: session == null ? undefined : { authUserId: session.user.id },
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
    server: PUBLIC_ZERO_URL,
    storageKey,
    // `undefined` rather than `'anon'` for logged-out clients. Zero 1.4 deprecated the sentinel
    // ahead of the client-group security work in 1.5, and a real user id is the only thing that may
    // appear here. It also changes the IndexedDB key for logged-out clients, so they get one cold
    // replica on the way past.
    userID: session?.user.id,
  }
}
