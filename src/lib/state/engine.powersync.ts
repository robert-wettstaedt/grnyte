import { dev } from '$app/environment'
import { resolve } from '$app/paths'
import { env } from '$env/dynamic/public'
import type { ResumeState } from '$lib/components/StatusBar/statusBar'
import {
  clearPowerSync,
  dismissRefusal,
  dropAccount,
  initPowerSync,
  onMarkerMove,
  onStaleReturn,
  powerSyncStatus,
  refusals,
  resumeStatus,
  refreshQueued as sendQueued,
  storeBlocked,
  syncConnection,
} from '$lib/powersync/db.svelte'
import { createUploader, queuedOnDevice } from '$lib/powersync/queue'
import { checkSession, type Checked } from '$lib/zero/checkSession'
import type { ConnectionName } from '$lib/zero/connection'
import { refreshReads, setReadUser } from '$lib/zero/source.powersync.svelte'
import { deliver, setWriteToken } from '$lib/zero/write.powersync'
import type { Session, SupabaseClient } from '@supabase/supabase-js'

/** A stuck clear must not keep the next account on the old screen. */
const LEAVE_CAP_MS = 3000

export { dismissRefusal, refusals, storeBlocked }

/** Lets queued writes go for a moment, then counts those left on the device, every account's: a sign-out deletes them all. */
export async function refreshQueued(): Promise<number> {
  await sendQueued()
  return queuedOnDevice(localStorage)
}

/** The account this document runs as; signing out does not change it. */
let startedUserId: string | undefined
/** The session the screens were last given. */
let lastSession: Session | undefined
/** Once true it stays: the document is replaced. */
let leaving = false
const HELD = new Promise<never>(() => {})

export function clearLocal(): Promise<void> {
  return clearPowerSync()
}

/** Reactive. The sync connection, as the status bar reads it. */
export function connection(): ConnectionName {
  return syncConnection()
}

/** PowerSync retries a refused download for ever rather than parking, so a held error is the signal. */
export function downloadRefused(): boolean {
  return powerSyncStatus()?.dataFlowStatus.downloadError != null
}

/** The sync asks for its token at every connect, so nothing waits on a refused one. */
export function recoverSignIn(
  _supabase: SupabaseClient,
  _session: null | Session | undefined,
): (() => void) | undefined {
  return undefined
}

export function resume(): ResumeState {
  return resumeStatus()
}

/** Whether an auth event's session is another one than the screens were given. One without a session is none: a
 *  sign-out has its own event, and a session that cannot be read now would be asked for in a loop. */
export function sessionMoved(next: null | Session, shown: null | Session | undefined): boolean {
  return next != null && next.access_token !== shown?.access_token
}

/** Answers the session the screens are to show when it is not the one given, and never answers while the tab leaves:
 *  no screen may see another account's session. */
export function start(
  session: null | Session | undefined,
  supabase: SupabaseClient,
): Promise<Session | undefined> | undefined {
  if (leaving) return HELD
  if (startedUserId != null) {
    if (session == null) return withoutSession(startedUserId, supabase)
    if (session.user.id !== startedUserId) return leaveForOtherAccount(startedUserId)
  }
  startedUserId ??= session?.user.id
  lastSession = session ?? undefined

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
  const check = (refused?: string) => checkStored(supabase, refused)
  setWriteToken(readSession, startedUserId, check)
  setReadUser(startedUserId, check)
  onStaleReturn(refreshReads)
  // A comment moves the events marker through `events.comment_count`; an emoji or an edit moves none.
  onMarkerMove('region_counters', () => refreshReads(['listEvents', 'listComments']))
  onMarkerMove('user_counters', () => refreshReads(['countUnreadNotifications', 'listNotifications']))
  initPowerSync(session, syncToken, {
    // shortcut: dev falls back to the local service until PUBLIC_POWERSYNC_URL is in every .env.
    endpoint: env.PUBLIC_POWERSYNC_URL || (dev ? 'http://localhost:58100' : ''),
    upload: createUploader({ applied: () => refreshReads(), send: deliver }),
  })
}

/** What is stored for this document's account; a document that started signed in and finds nothing leaves. */
async function checkStored(supabase: SupabaseClient, refused?: string): Promise<Checked> {
  const userId = startedUserId
  if (userId == null) return 'unreadable'
  // A check that fails says nothing, as an unreadable store says nothing.
  const checked = await checkSession(supabase.auth, { refused, userId }).catch((): Checked => 'unreadable')
  if (checked === 'signedOut') await leaveSignedOut(supabase, userId)
  return checked
}

/** A second tab signed in as another account: mounted forms would submit as it, and the first one's store must not
 *  stay on a shared device. */
function leaveForOtherAccount(account: string): Promise<never> {
  leaving = true
  void loadWipe()
    // Before the clear: an emptied store reads as an answer of none, which the layout sends elsewhere.
    .then((wipe) => wipe?.setLeaving(true))
    .then(() => {
      const cleared = dropAccount(account).catch((error: unknown) => console.error('[engine] clear failed', error))
      return Promise.race([cleared, new Promise((done) => setTimeout(done, LEAVE_CAP_MS))])
    })
    .then(() => {
      location.reload()
    })
  return HELD
}

async function leaveSignedOut(supabase: SupabaseClient, userId: string): Promise<void> {
  const wipe = await loadWipe()
  if (leaving || wipe?.isLeaving() === true) return
  // Again, right before: the wipe deletes every account's file, and the next one may have signed in by now.
  const again = await checkSession(supabase.auth, { userId }).catch((): Checked => 'unreadable')
  if (again !== 'signedOut') return
  // Several refused reads ask at once.
  if (leaving || wipe?.isLeaving() === true) return
  leaving = true
  const to = resolve('/')
  if (wipe == null) location.replace(to)
  else void wipe.wipeAndLeave(to)
}

/** Lazy, as `wipe` imports the engine. A chunk that fails to load must not keep a tab on the old screens. */
const loadWipe = () => import('./pwa/wipe').catch(() => undefined)

async function withoutSession(account: string, supabase: SupabaseClient): Promise<Session | undefined> {
  const checked = await checkStored(supabase)
  if (leaving) return HELD
  if (typeof checked === 'string') return lastSession
  return checked.user.id === account ? (start(checked, supabase) ?? checked) : leaveForOtherAccount(account)
}
