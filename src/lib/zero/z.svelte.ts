import { PUBLIC_ZERO_URL } from '$env/static/public'
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

  if (session != null) {
    // Eagerly sync app-wide reference data and the signed-in user into the
    // local store so resources reading them (see $lib/state/global.svelte)
    // render immediately rather than flashing a loading state.
    Promise.all([
      z.preload(queries.listGrades()).complete,
      z.preload(queries.currentUser()).complete,
      z.preload(queries.currentUserRole()).complete,
      z.preload(queries.listRolePermissions()).complete,
      z.preload(queries.listUserRegions()).complete,
    ]).catch((error: unknown) => {
      console.error('Error preloading global queries:', error)
    })
  }

  instance = z
  return z
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
