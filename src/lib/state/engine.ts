import type { ResumeState } from '$lib/components/StatusBar/statusBar'
import type { Refusal } from '$lib/powersync/queue'
import {
  authRetryDelay,
  isDefinitiveRefusal,
  lastAuthAttemptAt,
  SESSION_GONE,
  startAuthRecovery,
  stopAuthRecovery,
} from '$lib/zero/authRecovery'
import { isTerminal, type ConnectionName } from '$lib/zero/connection'
import { getZ, initZero } from '$lib/zero/z.svelte'
import type { Session, SupabaseClient } from '@supabase/supabase-js'

// The app's one engine seam: the PowerSync build swaps this module for `engine.powersync.ts`.

/** Clears local data on sign-out beyond Zero's own stores, which `wipe.ts` drops in both builds. */
export async function clearLocal(): Promise<void> {}

/** Reactive. The sync connection, as the status bar reads it. */
export function connection(): ConnectionName {
  return getZ().connectionState.name
}

/** Forgets a refused queued write. Zero queues nothing, so there is none. */
export async function dismissRefusal(_id: string): Promise<void> {}

/** Whether the sync server refused the download, so an empty local store is not still arriving. */
export function downloadRefused(): boolean {
  return isTerminal(connection())
}

/**
 * Asks for a fresh token while Zero refuses the one it has: the auth listener waits on a Supabase event, which an
 * installed iOS web app was measured never receiving. Reactive; answers what stops it.
 */
export function recoverSignIn(supabase: SupabaseClient, session: null | Session | undefined): (() => void) | undefined {
  const delay = authRetryDelay(connection(), lastAuthAttemptAt(), Date.now())
  if (delay == null) return

  const refused = session?.access_token
  startAuthRecovery(delay, {
    onSession: initZero,
    // `refreshSession`, not `getSession`: the stored token is the one just rejected. Caught
    // because auth-js rethrows a network failure, which is retryable.
    refresh: () =>
      supabase.auth
        .refreshSession()
        .then(({ data, error }) => (error != null && isDefinitiveRefusal(error) ? SESSION_GONE : data.session))
        .catch(() => null),
    reread: () =>
      supabase.auth
        .getSession()
        .then(({ data }) => (data.session != null && data.session.access_token !== refused ? data.session : null))
        .catch(() => null),
    // Its `SIGNED_OUT` event wipes the device and leaves for `/` (the layout's listener).
    signOut: () => void supabase.auth.signOut({ scope: 'local' }),
    // The live client, not `session`, which still holds the old user mid sign-out.
    wants: (next) => getZ().userID === next.user.id,
  })

  return stopAuthRecovery
}

/** Lets queued writes go, then counts those left on the device. Zero queues nothing. */
export async function refreshQueued(): Promise<number> {
  return 0
}

/** Reactive. Queued writes the server refused; Zero queues nothing. */
export function refusals(): readonly Refusal[] {
  return []
}

/** The catch-up after a return to the foreground: Zero reconnects by itself and has none to show. */
export function resume(): ResumeState {
  return 'idle'
}

/** Whether an auth event's session is another one than the screens were given. */
export function sessionMoved(next: null | Session, shown: null | Session | undefined): boolean {
  return next?.access_token !== shown?.access_token
}

/** Starts the build's sync for the signed-in session, before any (app) page reads it. Answers another session when
 *  the screens are to show that one. */
export function start(
  session: null | Session | undefined,
  _supabase: SupabaseClient,
): Promise<Session | undefined> | undefined {
  initZero(session)
  return undefined
}

/** Whether another tab keeps this one's local store from opening: Zero's tabs share theirs. */
export function storeBlocked(): boolean {
  return false
}
