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
// through `getZ()` — resources re-target their queries onto the new client.
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
    throw new Error('Zero is not initialized — initZero(session) must run in the root layout load first')
  }

  return instance
}

/**
 * Creates (or reuses) the Zero client for the given session. Called from the
 * root layout load, which re-runs on `supabase:auth` invalidation — the client
 * is only swapped when the signed-in user actually changed.
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
    // handler here could only ever be dead code. Offline the whole chain simply never settles,
    // which is the correct outcome - `markSynced` must not fire for a sync that did not happen.
    void Promise.all([
      z.preload(queries.listGrades()).complete,
      z.preload(queries.currentUser()).complete,
      z.preload(queries.currentUserRole()).complete,
      z.preload(queries.listRolePermissions()).complete,
      z.preload(queries.listUserRegions()).complete,
      // The reference data is in the local store and the server confirmed it. That is the narrowest
      // honest definition of "this device has a usable copy", and it is what tells a later visit
      // with an empty store that the store was wiped rather than never filled.
    ]).then(markSynced)

    preloadForOffline(z)
  }

  instance = z

  if (dev) {
    // Sync failures are invisible from the outside: the app just renders a spinner or stale rows,
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

/**
 * Keeps the whole guidebook in the local store, so it is readable at a crag with no signal.
 *
 * `preload()` and never `cleanup()`, and the "never" is the whole mechanism. A preload's TTL governs
 * how long its rows survive *after* `cleanup()` is called (see `PreloadOptions` in Zero's
 * `query.d.ts`); while the preload is live the rows are simply kept. So retention here rests on
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
 * Three queries cover the guidebook because the related trees overlap heavily, and Zero syncs the
 * union of active queries rather than a copy per query:
 * - `listRoutes` carries tags, first ascents, block, area, and topo with its file.
 * - `listAreas` carries the parent chain and parking locations.
 * - `listBlocks` carries topos with files, area with parent, and the block's own geolocation.
 * There is deliberately no geolocations preload: the two above already sync every one we render.
 *
 * Not preloaded, and this is a product decision rather than an oversight: events, changes, reactions
 * and other people's ascents. Those surfaces must say "not available offline" rather than render
 * empty, or a gap in the sync reads as a fact about the crag.
 */
function preloadForOffline(z: Z<Schema>): void {
  if (!isFieldDevice()) {
    return
  }

  // Fired and not awaited, and with no `catch`: `complete` resolves or stays pending, it never
  // rejects, so there is nothing to handle. The `run` calls below are a different matter, those can.
  z.preload(queries.listRoutes({}))
  z.preload(queries.listAreas({}))
  z.preload(queries.listBlocks({}))

  // Your own ascents (tick marks on every route) and your own favorites (the save button's state).
  // Both are keyed on the numeric `users.id` rather than the auth uid, which is only knowable by
  // reading the user row first — hence the `run` ahead of the preloads rather than two more entries
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
