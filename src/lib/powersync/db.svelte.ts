import { browser } from '$app/environment'
import type { ResumeState } from '$lib/components/StatusBar/statusBar'
import { reportConnectionState, withdrawConnectionState } from '$lib/state/online.svelte'
import {
  localStoreLoaded,
  markStoreLoaded,
  markStoreWarm,
  markSynced,
  trackSyncFor,
  type SyncStamp,
} from '$lib/state/sync.svelte'
import type { ConnectionName } from '$lib/zero/connection'
import {
  PowerSyncDatabase,
  SyncStreamConnectionMethod,
  type PowerSyncBackendConnector,
  type SyncStatus,
} from '@powersync/web'
import type { Session } from '@supabase/supabase-js'
import { lockWaits } from './lock'
import { isStale, RESUME_SHOW_MS, RESUME_STALL_MS, resumeState } from './resume'
import { appSchema } from './schema'

/** Every account file starts with this, so a sign-out can find the ones it did not open. */
const FILE_PREFIX = 'grnyte-'

/** Where the service is. The start-up reads it from the environment, which only exists inside SvelteKit's runtime. */
export interface PowerSyncSettings {
  endpoint: string
}

let settings: PowerSyncSettings = { endpoint: '' }
let db: PowerSyncDatabase | undefined
let userId: string | undefined
let cleared = Promise.resolve()
/** Stops the open database's status listener, so nothing it reports reaches the next account. */
let stopWatching = () => {}
// Raw: PowerSync hands over a new status object on every change and never mutates one.
let status = $state.raw<SyncStatus | undefined>(undefined)
/** The stamps this account has written since its file was opened, so each is written once. */
let stamped: SyncStamp[] = []
/** What the online flag was last told of the open account, and the checkpoint that was newest then. */
let reported: undefined | { checkpoint: number; connected: boolean }
/** When the open file was opened: a stream's `lastSyncedAt` before it is a previous session's, read off disk. */
let openedAt = 0
/** Streams synced this session and copied into the collections; the persisted `hasSynced` promises neither. */
let confirmed = $state.raw<readonly string[]>([])
let confirming: string[] = []
/** This tab's collections' own tracking tables. Desktop tabs share one connection; others' stay out of the count. */
let trackedTables: () => string[] = () => []
/** Another tab holds the file, so it does not open here. */
let blocked = $state(false)
/** Runs while the store is loading or unconnected. */
let lockTimer: ReturnType<typeof setInterval> | undefined
/** Unconnected because another tab holds the sync, which says nothing of the network: the report is taken back. */
let withheld = false
/** `at` is wall-clock, to compare with `lastSyncedAt`; `t` and `connectedT` are `performance.now()`, for durations. */
let returned = $state.raw<undefined | { at: number; connectedT: number; hiddenFor: number; t: number }>(undefined)
/** Bumped just after the bar's show delay and the stall limit pass, so `resumeStatus` is read again. */
let resumeClock = $state(0)
let resumeTimers: ReturnType<typeof setTimeout>[] = []
/** Wall-clock: a monotonic clock may stop while the device sleeps, and a locked phone must count as away. */
let hiddenAt: number | undefined
let watchingVisibility = false
let releasingOnHide = false
/** PowerSync's database workers, ended as the page leaves: a close is async and Safari freezes the page first. */
const databaseWorkers: Worker[] = []
// WebKit holds the end of a `fetch` sync stream until more bytes come: the next keepalive, 20 s later.
const CONNECT = { connectionMethod: SyncStreamConnectionMethod.WEB_SOCKET }
/** Restarts the open account's sync: a fresh stream always delivers a checkpoint, a frozen one may never. */
let restartSync = () => {}
let staleReturn = () => {}
/** One listener per change-marker table, set by the engine start, which runs again on every token refresh. */
// eslint-disable-next-line svelte/prefer-svelte-reactivity -- nothing reads it reactively
const markerListeners = new Map<string, () => void>()
// eslint-disable-next-line svelte/prefer-svelte-reactivity -- nothing reads it reactively
const movedWhileHidden = new Set<string>()
let stopMarkers = () => {}
type MarkerTable = keyof typeof appSchema.props
/** A busy region moves its marker often; every move asks the server. */
const MARKER_THROTTLE_MS = 1000

/** Removes every account's local data from this device, open or not. */
export async function clearPowerSync(): Promise<void> {
  const open = userId == null ? [] : [fileName(userId)]
  await closeCurrent()
  userId = undefined
  // `databases()` is missing before Firefox 126: then only the file this page opened is known.
  const files =
    'databases' in indexedDB
      ? (await indexedDB.databases()).map((info) => info.name ?? '').filter((name) => name.startsWith(FILE_PREFIX))
      : open
  const deleted = await Promise.all(files.map((name) => deleteUnrefused(name)))
  const left = files.filter((_, i) => !deleted[i])
  if (left.length > 0) throw new Error(`account files left: ${left.join(', ')}`)
}

/** Closes the open database and deletes this account's file: cleared rows stay readable in its freed pages. Only
 *  that file: a second tab may have another account's open. */
export async function dropAccount(id: string): Promise<void> {
  await cleared
  try {
    await closeCurrent()
  } finally {
    await deleteUnrefused(fileName(id))
  }
}

const fileName = (id: string) => `${FILE_PREFIX}${id}.sqlite`

export function getPowerSync(): PowerSyncDatabase {
  if (db == null) throw new Error('PowerSync is not initialized: initPowerSync(session) must run first')
  return db
}

/**
 * Opens (or keeps) the signed-in account's database and connects it. `accessToken` is asked on every connect and
 * reconnect, so a token refreshed while the app was in the background is used without anyone pushing it.
 */
export function initPowerSync(
  session: null | Session | undefined,
  accessToken: () => Promise<string | undefined>,
  options: PowerSyncSettings,
): void {
  if (!browser) return
  settings = options
  if (db != null && userId !== session?.user.id) {
    // A reload follows every sign-out; this covers a switch that skips it.
    cleared = closeCurrent().catch((error: unknown) => console.error('[powersync] clear failed', error))
  }
  userId = session?.user.id
  if (session == null || db != null) return

  releaseOnPageHide()
  // The default IndexedDB store, not OPFS: on iOS Safari a reload left the previous page holding the OPFS file and
  // the new page never finished a sync (design D5, client store).
  const opened = new PowerSyncDatabase({
    database: { dbFilename: fileName(session.user.id) },
    schema: appSchema,
  })
  db = opened
  stamped = []
  openedAt = Date.now()
  confirmed = []
  confirming = []
  trackSyncFor(session.user.id)
  // Every late callback checks it still belongs to the open account: a switch closes this one asynchronously.
  const current = () => db === opened
  const authId = session.user.id
  void opened
    .waitForReady()
    .then(async () => {
      // Open is not read: the live queries take seconds more on a phone, and offline that gap looked like a cold store.
      const row = current() ? await opened.getOptional('select 1 from users where auth_user_fk = ?', [authId]) : null
      if (!current()) return
      if (row != null) markStoreWarm()
      markStoreLoaded()
      report()
    })
    .catch((error: unknown) => console.error('[powersync] local read failed', error))
  observe(opened.currentStatus)
  stopWatching = opened.registerListener({ statusChanged: (next) => current() && observe(next) })
  watchMarkers(opened)

  const connector: PowerSyncBackendConnector = {
    fetchCredentials: async () => {
      const token = await accessToken()
      return token == null ? null : { endpoint: settings.endpoint, token }
    },
    // Nothing writes to the local database; writes go through the server mutators.
    uploadData: async () => {},
  }
  void cleared
    .then(() => (current() ? opened.connect(connector, CONNECT) : undefined))
    .catch((error: unknown) => console.error('[powersync] connect failed', error))
  restartSync = () =>
    void opened
      .disconnect()
      .then(() => (current() ? opened.connect(connector, CONNECT) : undefined))
      .catch((error: unknown) => console.error('[powersync] reconnect failed', error))
  watchVisibility()
  askLocks()
}

/** Tells `callback` when `table`, a change marker, changes in the open account's database; one per table. */
export function onMarkerMove(table: MarkerTable, callback: () => void): void {
  const known = markerListeners.has(table)
  markerListeners.set(table, callback)
  // The engine start runs again on every token refresh; a known table's watch already reads the new callback.
  if (db != null && !known) watchMarkers(db)
}

/** One listener, not a list: the engine start that sets it runs again on every token refresh. */
export function onStaleReturn(callback: () => void): void {
  staleReturn = callback
}

export function powerSyncStatus(): SyncStatus | undefined {
  return status
}

export function registerCollections(database: PowerSyncDatabase, tables: () => string[]): void {
  if (database === db) trackedTables = tables
}

/** `idle` unless the open account returned to the foreground stale and has not caught up (design D14). */
export function resumeStatus(): ResumeState {
  void resumeClock
  if (returned == null) return 'idle'
  const now = performance.now()
  return resumeState({
    checkpoint: (status?.lastSyncedAt?.getTime() ?? 0) > returned.at,
    hiddenFor: returned.hiddenFor,
    since: now - returned.t,
    // A dropped stream is the hold's to report as reconnecting, not a stall.
    sinceConnected: status?.connected === true ? now - returned.connectedT : 0,
  })
}

/** Reactive. The account's file has not opened because another tab holds it. */
export function storeBlocked(): boolean {
  return blocked && !localStoreLoaded()
}

/** Whether `stream` has synced in this session and every collection has taken its rows in: only then is an
 *  empty result an answer online. */
export function streamConfirmed(stream: string): boolean {
  return confirmed.includes(stream)
}

/** Reactive. Everything short of connected is one name: PowerSync flips between two while it backs off. Before the
 *  store is loaded there is nothing to say. */
export function syncConnection(): ConnectionName {
  return localStoreLoaded() && status?.connected === false ? 'connecting' : 'connected'
}

/** Stops, clears and closes the open account's database, so its file can be deleted or another one opened. */
async function closeCurrent(): Promise<void> {
  stopWatching()
  stopWatching = () => {}
  stopMarkers()
  stopMarkers = () => {}
  movedWhileHidden.clear()
  const closing = db
  db = undefined
  trackedTables = () => []
  confirmed = []
  confirming = []
  returned = undefined
  reported = undefined
  status = undefined
  withheld = false
  blocked = false
  stopAskingLocks()
  restartSync = () => {}
  await closing?.disconnectAndClear()
  await closing?.close()
}

function confirmStreams(next: SyncStatus): void {
  const opened = db
  if (opened == null) return
  for (const { subscription } of next.syncStreams ?? []) {
    const { lastSyncedAt, name } = subscription
    if (lastSyncedAt == null || lastSyncedAt.getTime() < openedAt) continue
    if (confirmed.includes(name) || confirming.includes(name)) continue
    confirming.push(name)
    copiedIn(opened)
      .then(() => {
        if (db === opened) confirmed = [...confirmed, name]
      })
      .catch(() => {
        if (db === opened) confirming = confirming.filter((other) => other !== name)
      })
  }
}

/** Resolves once no collection has changes left to take in. Each copies through a temp table it empties, so
 *  synced rows are not yet readable while one holds a row. Under the write lock: temp tables are per connection. */
async function copiedIn(opened: PowerSyncDatabase): Promise<void> {
  for (let wait = 50; ; wait = Math.min(wait * 2, 1000)) {
    const names = trackedTables()
    const pending = await opened.writeLock(async (tx) => {
      const tables = await tx.getAll<{ name: string }>(
        `SELECT name FROM sqlite_temp_master WHERE type = 'table' AND name IN (${names.map(() => '?').join(',')})`,
        names,
      )
      let rows = 0
      for (const { name } of tables) rows += (await tx.get<{ n: number }>(`SELECT count(*) AS n FROM "${name}"`)).n
      return rows
    })
    if (pending === 0) return
    await new Promise((resolve) => setTimeout(resolve, wait))
  }
}

const LOCK_ASK_MS = 1_000
/** A slow phone's own worker may need this long for the file. */
const BLOCKED_AFTER_MS = 3_000

/** Asked again and again: the SDK requests the sync lock only some time after a status says unconnected. */
function askLocks(): void {
  lockTimer ??= setInterval(() => void readLocks().catch(() => undefined), LOCK_ASK_MS)
}

/** Unanswered by then, a delete is queued behind another tab's blocked one, which fires no event of its own. */
const DELETE_QUEUED_MS = 300

/** False only if refused within the wait. Blocked or queued is true: it completes once the last connection closes,
 *  for PowerSync's shared sync worker when the page goes. A later refusal is logged. */
function deleteUnrefused(name: string): Promise<boolean> {
  return new Promise((resolve) => {
    let answered = false
    const answer = (deleted: boolean) => {
      answered = true
      resolve(deleted)
    }
    const request = indexedDB.deleteDatabase(name)
    request.onsuccess = request.onblocked = () => answer(true)
    request.onerror = () =>
      answered ? console.error('[powersync] account file left', name, request.error) : answer(false)
    setTimeout(() => answer(true), DELETE_QUEUED_MS)
  })
}

/** The stall limit counts from a re-established connection: offline, nothing can arrive (design D14). */
function noteReconnect(next: SyncStatus): void {
  if (returned == null || !next.connected || status?.connected === true) return
  returned = { ...returned, connectedT: performance.now() }
  rereadAfter(RESUME_STALL_MS)
}

/** Takes a status in and writes the stamps the shell reads: the essentials (priority 0), then everything. */
function observe(next: SyncStatus): void {
  if (next === status) return
  noteReconnect(next)
  status = next
  confirmStreams(next)
  report()
  const reached: SyncStamp[] = []
  if (next.statusForPriority(0)?.hasSynced) reached.push('reference')
  if (next.hasSynced) reached.push('guidebook', 'personal')
  for (const stamp of reached) {
    if (stamped.includes(stamp)) continue
    stamped.push(stamp)
    markSynced(stamp)
  }
}

async function readLocks(): Promise<void> {
  const opened = db
  if (opened == null || userId == null || (localStoreLoaded() && status?.connected === true)) {
    stopAskingLocks()
    return
  }
  const waits = await lockWaits(fileName(userId))
  if (db !== opened) return
  blocked = waits.file && Date.now() - openedAt >= BLOCKED_AFTER_MS
  withholdWhile(waits.sync)
}

/**
 * Safari keeps a page it left alive for back and forward, and its database worker keeps the file's lock, so the tab's
 * next page never opens the store. Ending the worker frees the lock at once; a restored page reloads to open it again.
 */
function releaseOnPageHide(): void {
  if (releasingOnHide || typeof Worker === 'undefined') return
  releasingOnHide = true
  const Native = globalThis.Worker
  // The SDK spawns its worker itself (named `powersync-<file>`); wrapping the constructor keeps its URL and bundling.
  globalThis.Worker = class extends Native {
    constructor(url: string | URL, options?: WorkerOptions) {
      super(url, options)
      if (options?.name?.startsWith('powersync-')) databaseWorkers.push(this)
    }
  }
  let ended = false
  addEventListener('pagehide', () => {
    for (const worker of databaseWorkers.splice(0)) {
      worker.terminate()
      ended = true
    }
  })
  // A shared worker (multi-tab, Chrome's default) is not wrapped and survives, so that page needs no reload.
  addEventListener('pageshow', (event) => event.persisted && ended && location.reload())
}

/** Tells the online flag. A status may be raised locally on a socket that has not noticed it died, so the same
 *  connection is told again only with a newer checkpoint, which is proof. */
function report(): void {
  if (status == null || !localStoreLoaded()) return
  const { connected } = status
  const checkpoint = status.lastSyncedAt?.getTime() ?? 0
  if (reported?.connected === connected && checkpoint <= reported.checkpoint) return
  reported = { checkpoint, connected }
  if (connected) withheld = false
  else askLocks()
  reportConnectionState({ name: connected ? 'connected' : 'connecting' })
}

/** Past the limit, so a coarsened clock (Firefox rounds to 100 ms) cannot read it just short. */
function rereadAfter(ms: number): void {
  resumeTimers.push(setTimeout(() => (resumeClock += 1), ms + 100))
}

function stopAskingLocks(): void {
  clearInterval(lockTimer)
  lockTimer = undefined
}

/** Each marker table watched on its own: PowerSync names a change by its internal table, not the one asked for. */
function watchMarkers(opened: PowerSyncDatabase): void {
  stopMarkers()
  const stops = [...markerListeners.keys()].map((table) =>
    opened.onChange(
      {
        onChange: () => {
          if (db !== opened) return
          if (document.visibilityState === 'hidden') movedWhileHidden.add(table)
          else markerListeners.get(table)?.()
        },
      },
      { tables: [table], throttleMs: MARKER_THROTTLE_MS },
    ),
  )
  stopMarkers = () => stops.forEach((stop) => stop())
}

/** Safari freezes a hidden page without the sync noticing, which then reports a dead stream as live (design D14). */
function watchVisibility(): void {
  if (watchingVisibility) return
  watchingVisibility = true
  document.addEventListener('visibilitychange', () => {
    for (const timer of resumeTimers) clearTimeout(timer)
    resumeTimers = []
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now()
      returned = undefined
      return
    }
    const held = [...movedWhileHidden]
    movedWhileHidden.clear()
    const tellHeld = () => held.forEach((table) => markerListeners.get(table)?.())
    // A tab loaded in the background never saw a hide.
    if (hiddenAt == null || db == null) return tellHeld()
    const hiddenFor = Date.now() - hiddenAt
    hiddenAt = undefined
    const t = performance.now()
    if (!isStale(hiddenFor)) return tellHeld()
    returned = { at: Date.now(), connectedT: t, hiddenFor, t }
    restartSync()
    staleReturn()
    rereadAfter(RESUME_SHOW_MS)
    rereadAfter(RESUME_STALL_MS)
  })
}

/** Takes the report back while another tab holds the sync, and gives it again once that ends. */
function withholdWhile(syncHeldElsewhere: boolean): void {
  if (!localStoreLoaded() || status?.connected !== false || syncHeldElsewhere === withheld) return
  withheld = syncHeldElsewhere
  if (withheld) {
    withdrawConnectionState()
  } else {
    reported = undefined
    report()
  }
}
