import { dev } from '$app/environment'
import { PUBLIC_ZERO_URL } from '$env/static/public'
import { isFieldDevice } from '$lib/state/device.svelte'
import { reportConnectionState } from '$lib/state/online.svelte'
import { forgetSynced, markSynced, trackSyncFor } from '$lib/state/sync.svelte'
import type { Session } from '@supabase/supabase-js'
import { Z } from 'zero-svelte'
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
  // The unsubscribe is kept and called on the next swap. Two live clients both writing that module's
  // one connection flag is not a tidiness problem: it only reacts to *changes*, so two clients
  // flapping out of step cancel each other's hold and it never fires.
  connectionUnsubscribe?.()
  connectionUnsubscribe = z.connection.state.subscribe(reportConnectionState)

  if (session != null) {
    // Eagerly sync app-wide reference data and the signed-in user into the
    // local store so resources reading them (see $lib/state/global.svelte)
    // render immediately rather than flashing a loading state.
    //
    // No `catch`: Zero's `complete` promise resolves or stays pending, it does not reject, so a
    // handler here could only ever be dead code. Offline the whole chain never settles,
    // which is the correct outcome - `markSynced` must not fire for a sync that did not happen.
    void Promise.all([
      z.preload(queries.listGrades()).complete,
      z.preload(queries.currentUser()).complete,
      z.preload(queries.currentUserRole()).complete,
      z.preload(queries.listRolePermissions()).complete,
      z.preload(queries.listUserRegions()).complete,
      // The reference data is in the local store and the server confirmed it. Narrow on purpose:
      // this says the shell can render, and nothing at all about the guidebook, which is thousands
      // of rows still arriving. `preloadForOffline` stamps that separately.
    ]).then(() => markSynced('reference'))

    preloadForOffline(z)
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

/**
 * Keeps the guidebook in the local store, plus your own logbook and your regions' members, so the
 * crag is readable with no signal. "Guidebook" is the crag itself (see CONTEXT.md); the other two
 * ride along because the screens that render it need them, not because they are part of it.
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
 * WHAT is kept lives in `OFFLINE_QUERIES`, not here, and the same table is what every screen reads
 * to decide whether an empty result means "we chose not to keep this" or "this device has not got
 * it". `offline.drift.test.ts` fails if the two halves disagree. This function is only the HOW: the
 * arguments each query needs, and the order they can be issued in.
 */
function preloadForOffline(z: Z<Schema>): void {
  if (!isFieldDevice()) {
    return
  }

  // These three go first and unconditionally, because they are the bulk of the sync and they need
  // nothing looked up first. Anything keyed on the numeric user id has to wait for the row below.
  //
  // Their completion is stamped, and that stamp is what lets a screen offline treat an empty result
  // as an answer rather than a gap. Without it the only signal was the reference stamp above, which
  // fires seconds earlier on five tiny queries: a device that finished those and then lost the
  // connection partway through `listRoutes` claimed authority over a guidebook it only partly had,
  // and rendered every area whose routes never arrived as an area with no routes.
  //
  // No `catch`: `complete` resolves or stays pending, it never rejects, so there is nothing to
  // handle and an interrupted sync never stamps. That is the outcome we want. The `run` calls
  // below are a different matter, those can reject.
  void Promise.all([
    z.preload(queries.listRoutes({})).complete,
    z.preload(queries.listAreas({})).complete,
    z.preload(queries.listBlocks({})).complete,
  ]).then(() => markSynced('guidebook'))

  // Your own ascents (sends logged on every route) and your own favorites (the save button's state).
  // Both are keyed on the numeric `users.id` rather than the auth uid, which is only knowable by
  // reading the user row first: hence the `run` ahead of the preloads rather than two more entries
  // in the batch above.
  z.run(queries.currentUser(), { type: 'complete' })
    .then((user) => {
      if (user?.id == null) {
        return
      }

      return Promise.all([
        z.preload(queries.listUserAscents({ userId: user.id })).complete,
        z.preload(queries.listUserAllFavorites({ userId: user.id })).complete,
      ])
    })
    .catch((error: unknown) => {
      console.error('Error preloading your ascents and favorites for offline use:', error)
    })

  // Everybody in your regions, which is the one table the three queries above do not reach and the
  // descriptions still point at: a `!users:id!` mention resolves through `usersByIds`, and a query
  // registered for the first time while offline has nothing local to answer from, so the mention
  // renders as its raw token in the middle of a sentence. Cheap: a region's community is a few hundred
  // rows against the ~5k routes already synced.
  z.run(queries.listUserRegions(), { type: 'complete' })
    .then((memberships) => {
      const regionFks = memberships.map((membership) => membership.regionFk)

      if (regionFks.length === 0) {
        return
      }

      return z.preload(queries.listUsers({ regionFks })).complete
    })
    .catch((error: unknown) => {
      console.error('Error preloading your region members for offline use:', error)
    })
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
