import { browser } from '$app/environment'
import { reportSyncStatus } from '$lib/state/online.svelte'
import { storage } from '$lib/state/storage'
import { markStoreLoaded, markStoreWarm, markSynced, trackSyncFor, type SyncStamp } from '$lib/state/sync.svelte'
import { PowerSyncDatabase, type PowerSyncBackendConnector, type SyncStatus, type WASQLiteVFS } from '@powersync/web'
import { dropAllDatabases } from '@rocicorp/zero'
import type { Session } from '@supabase/supabase-js'
import { syncMark } from './marks'
import { appSchema } from './schema'

/** Every account file starts with this, so a sign-out can find the ones it did not open. */
const FILE_PREFIX = 'grnyte-'
const ZERO_DROPPED_KEY = 'grnyte.zeroStoreDropped'

/** Where the service is, and whether it is the only engine running (the measurement build). The layout reads
 *  both from the environment, which only exists inside SvelteKit's runtime. */
export interface PowerSyncSettings {
  endpoint: string
  /** Collections take rows in only once subscribed (task 8.6 measurement); goes in R1. */
  lazyCollections?: boolean
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
      ...(settings.multiTabs == null ? {} : { enableMultiTabs: settings.multiTabs }),
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
      syncMark(`store open (${settings.vfs ?? 'IndexedDB'}${settings.multiTabs ? ', shared worker' : ''})`)
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
    .then(() => (current() ? opened.connect(connector) : undefined))
    .catch((error: unknown) => console.error('[powersync] connect failed', error))
}

export function powerSyncOnly(): boolean {
  return settings.only
}

/** shortcut: the measurement build starts only PowerSync; goes when Zero leaves the client. */
/** The settings the layout passed in, for the measurement switches read elsewhere. */
export function powerSyncSettings(): Readonly<PowerSyncSettings> {
  return settings
}

export function powerSyncStatus(): SyncStatus | undefined {
  return status
}

export function registerCollections(database: PowerSyncDatabase, tables: () => string[]): void {
  if (database === db) trackedTables = tables
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

/** Takes a status in and writes the stamps the shell reads: the essentials (priority 0), then everything. */
function observe(next: SyncStatus): void {
  if (next === status) return
  status = next
  if (next.connected) syncMark('connected')
  if (next.dataFlowStatus?.downloading) syncMark('downloading')
  if (next.statusForPriority(0)?.hasSynced) syncMark('synced: priority 0')
  if (next.hasSynced) syncMark('synced: all')
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
