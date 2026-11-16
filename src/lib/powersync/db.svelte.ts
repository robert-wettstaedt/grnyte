import { browser } from '$app/environment'
import { reportSyncStatus } from '$lib/state/online.svelte'
import { storage } from '$lib/state/storage'
import { markStoreLoaded, markStoreWarm, markSynced, trackSyncFor, type SyncStamp } from '$lib/state/sync.svelte'
import {
  PowerSyncDatabase,
  SyncStreamConnectionMethod,
  type PowerSyncBackendConnector,
  type SyncStatus,
  type WASQLiteVFS,
} from '@powersync/web'
import { dropAllDatabases } from '@rocicorp/zero'
import type { Session } from '@supabase/supabase-js'
import { syncMark } from './marks'
import { isStale, RESUME_SHOW_MS, RESUME_STALL_MS, resumeState, type ResumeState } from './resume'
import { appSchema } from './schema'

/** Every account file starts with this, so a sign-out can find the ones it did not open. */
const FILE_PREFIX = 'grnyte-'
const ZERO_DROPPED_KEY = 'grnyte.zeroStoreDropped'

/** Where the service is, and whether it is the only engine running (the measurement build). The layout reads
 *  both from the environment, which only exists inside SvelteKit's runtime. */
export interface PowerSyncSettings {
  endpoint: string
  /** Syncs in a shared worker instead of the page; PowerSync turns it off on Safari by default. */
  multiTabs?: boolean
  only: boolean
  /** The storage under test for the remeasure; unset keeps the default IndexedDB. */
  vfs?: WASQLiteVFS
}

let settings: PowerSyncSettings = { endpoint: '', only: false }
let db: PowerSyncDatabase | undefined
let userId: string | undefined
let cleared = Promise.resolve()
/** Stops the open database's status listener, so nothing it reports reaches the next account. */
let stopWatching = () => {}
// Raw: PowerSync hands over a new status object on every change and never mutates one.
let status = $state.raw<SyncStatus | undefined>(undefined)
/** The stamps this account has written since its file was opened, so each is written once. */
let stamped: SyncStamp[] = []
/** When the open file was opened: a stream's `lastSyncedAt` before it is a previous session's, read off disk. */
let openedAt = 0
/** Streams synced this session and copied into the collections; the persisted `hasSynced` promises neither. */
let confirmed = $state.raw<readonly string[]>([])
let confirming: string[] = []
/** This tab's collections' own tracking tables. Desktop tabs share one connection; others' stay out of the count. */
let trackedTables: () => string[] = () => []
/** `at` is wall-clock, to compare with `lastSyncedAt`; `t` and `connectedT` are `performance.now()`, for durations. */
let returned = $state.raw<undefined | { at: number; connectedT: number; hiddenFor: number; t: number }>(undefined)
/** Bumped just after the bar's show delay and the stall limit pass, so `resumeStatus` is read again. */
let resumeClock = $state(0)
let resumeTimers: ReturnType<typeof setTimeout>[] = []
/** Wall-clock: a monotonic clock may stop while the device sleeps, and a locked phone must count as away. */
let hiddenAt: number | undefined
let watchingVisibility = false
// WebKit holds the end of a `fetch` sync stream until more bytes come: the next keepalive, 20 s later.
const CONNECT = { connectionMethod: SyncStreamConnectionMethod.WEB_SOCKET }
/** Restarts the open account's sync: a fresh stream always delivers a checkpoint, a frozen one may never. */
let restartSync = () => {}

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
  const deleted = await Promise.all(files.map((name) => deleteDatabase(name)))
  const left = files.filter((_, i) => !deleted[i])
  if (left.length > 0) throw new Error(`account files left: ${left.join(', ')}`)
}

/** Drops the previous engine's local store once per device: it would otherwise keep a second copy of every region. */
export async function dropZeroStoreOnce(): Promise<void> {
  if (storage.get(ZERO_DROPPED_KEY) != null) return
  const { errors } = await dropAllDatabases()
  if (errors.length === 0) storage.set(ZERO_DROPPED_KEY, '1')
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

  // The default IndexedDB store, not OPFS: on iOS Safari a reload left the previous page holding the OPFS file and
  // the new page never finished a sync (design D5, client store).
  const opened = new PowerSyncDatabase({
    database: {
      dbFilename: fileName(session.user.id),
      ...(settings.vfs == null ? {} : { vfs: settings.vfs }),
      ...(settings.multiTabs ? { enableMultiTabs: true } : {}),
    },
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
      syncMark(
        `store open (${settings.vfs ?? 'IndexedDB'}${settings.multiTabs ? ', shared worker' : ''}, ${row == null ? 'cold' : 'warm'})`,
      )
      if (row != null) markStoreWarm()
      markStoreLoaded()
      // Which SQLite build the worker loaded, asked of the database itself: only the cipher (JSPI) build has this function.
      void opened.get<{ v: string }>('select sqlite3mc_version() as v').then(
        ({ v }) => syncMark(`sqlite build: JSPI (mc ${v})`),
        () => syncMark('sqlite build: Asyncify'),
      )
    })
    .catch((error: unknown) => console.error('[powersync] local read failed', error))
  observe(opened.currentStatus)
  stopWatching = opened.registerListener({ statusChanged: (next) => current() && observe(next) })

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
}

/** shortcut: the measurement build starts only PowerSync; goes when Zero leaves the client. */
export function powerSyncOnly(): boolean {
  return settings.only
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

/** Whether `stream` has synced in this session and every collection has taken its rows in: only then is an
 *  empty result an answer online. */
export function streamConfirmed(stream: string): boolean {
  return confirmed.includes(stream)
}

/** Stops, clears and closes the open account's database, so its file can be deleted or another one opened. */
async function closeCurrent(): Promise<void> {
  stopWatching()
  stopWatching = () => {}
  const closing = db
  db = undefined
  trackedTables = () => []
  confirmed = []
  confirming = []
  returned = undefined
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
    syncMark(`synced: ${name}`)
    copiedIn(opened)
      .then(() => {
        if (db !== opened) return
        confirmed = [...confirmed, name]
        syncMark(`taken in: ${name}`)
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

/** Whether the delete went through. Blocked counts: it completes once the last connection closes. */
function deleteDatabase(name: string): Promise<boolean> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(name)
    request.onsuccess = request.onblocked = () => resolve(true)
    request.onerror = () => resolve(false)
  })
}

function markTimeline(next: SyncStatus): void {
  if (next.connected) syncMark('connected')
  if (next.dataFlowStatus?.downloading) syncMark('downloading')
  if (next.statusForPriority(0)?.hasSynced) syncMark('synced: priority 0')
  if (next.hasSynced) syncMark('synced: all')
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
  markTimeline(next)
  confirmStreams(next)
  // While Zero syncs, the online signal is Zero's. The stamps are PowerSync's: Zero keeps nothing offline any more.
  if (powerSyncOnly()) reportSyncStatus(next)
  const reached: SyncStamp[] = []
  if (next.statusForPriority(0)?.hasSynced) reached.push('reference')
  if (next.hasSynced) reached.push('guidebook', 'personal')
  for (const stamp of reached) {
    if (stamped.includes(stamp)) continue
    stamped.push(stamp)
    markSynced(stamp)
  }
}

/** Past the limit, so a coarsened clock (Firefox rounds to 100 ms) cannot read it just short. */
function rereadAfter(ms: number): void {
  resumeTimers.push(setTimeout(() => (resumeClock += 1), ms + 100))
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
    if (hiddenAt == null || db == null) return
    const hiddenFor = Date.now() - hiddenAt
    hiddenAt = undefined
    const t = performance.now()
    if (!isStale(hiddenFor)) return
    returned = { at: Date.now(), connectedT: t, hiddenFor, t }
    restartSync()
    rereadAfter(RESUME_SHOW_MS)
    rereadAfter(RESUME_STALL_MS)
  })
}
