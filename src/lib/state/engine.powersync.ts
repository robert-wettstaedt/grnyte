import { dev } from '$app/environment'
import { env } from '$env/dynamic/public'
import type { ResumeState } from '$lib/components/StatusBar/statusBar'
import {
  clearPowerSync,
  dropAccount,
  initPowerSync,
  onStaleReturn,
  powerSyncStatus,
  resumeStatus,
} from '$lib/powersync/db.svelte'
import { refreshReads, setReadUser } from '$lib/zero/source.powersync.svelte'
import { setWriteToken } from '$lib/zero/write.powersync'
import { initZero } from '$lib/zero/z.svelte'
import type { Session, SupabaseClient } from '@supabase/supabase-js'

/** A stuck clear must not keep the next account on the old screen. */
const LEAVE_CAP_MS = 3000

/** The account this document runs as; signing out does not change it. */
let startedUserId: string | undefined
let leaving = false

export function clearLocal(): Promise<void> {
  return clearPowerSync()
}

/** PowerSync retries a refused download for ever rather than parking, so a held error is the signal. */
export function downloadRefused(): boolean {
  return powerSyncStatus()?.dataFlowStatus.downloadError != null
}

export function resume(): ResumeState {
  return resumeStatus()
}

/** PowerSync reads the guidebook, the app server takes writes and the other reads; Zero still carries the connection state. */
export function start(session: null | Session | undefined, supabase: SupabaseClient): void {
  const userId = session?.user.id
  if (startedUserId != null && userId != null && userId !== startedUserId) {
    leaveForOtherAccount(startedUserId)
    return
  }
  startedUserId ??= userId

  const readSession = async () => {
    const { data, error } = await supabase.auth.getSession()
    // An expired token that the network kept from being renewed: not signed out. By name, as in `auth.server`.
    if (error?.name === 'AuthRetryableFetchError') throw error
    const current = data.session
    return current == null ? undefined : { token: current.access_token, userId: current.user.id }
  }
  // Storage is every tab's: another account's token would sync its rows into this account's file.
  const syncToken = async () => {
    const current = await readSession()
    return current?.userId === startedUserId ? current?.token : undefined
  }
  setWriteToken(readSession, startedUserId)
  setReadUser(startedUserId)
  onStaleReturn(refreshReads)
  initPowerSync(session, syncToken, {
    // shortcut: dev falls back to the local service until PUBLIC_POWERSYNC_URL is in every .env.
    endpoint: env.PUBLIC_POWERSYNC_URL || (dev ? 'http://localhost:58100' : ''),
  })
  initZero(session, { preload: false })
}

/** A second tab signed in as another account: mounted forms would submit as it, and the first one's store must not
 *  stay on a shared device. */
function leaveForOtherAccount(account: string): void {
  if (leaving) return
  leaving = true
  const cleared = dropAccount(account).catch((error: unknown) => console.error('[engine] clear failed', error))
  void Promise.race([cleared, new Promise((done) => setTimeout(done, LEAVE_CAP_MS))]).then(() => location.reload())
}
