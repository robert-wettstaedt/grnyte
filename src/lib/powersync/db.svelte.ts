import { browser } from '$app/environment'
import { reportSyncStatus } from '$lib/state/online.svelte'
import { storage } from '$lib/state/storage'
import { markStoreLoaded, markSynced, trackSyncFor, type SyncStamp } from '$lib/state/sync.svelte'
import { PowerSyncDatabase, type PowerSyncBackendConnector, type SyncStatus } from '@powersync/web'
import { dropAllDatabases } from '@rocicorp/zero'
import type { Session } from '@supabase/supabase-js'
import { appSchema } from './schema'

/** Every account file starts with this, so a sign-out can find the ones it did not open. */
const FILE_PREFIX = 'grnyte-'
/** Status events never fire on iOS Safari (no shared worker), so the status is also read on this beat. */
const POLL_MS = 250
const ZERO_DROPPED_KEY = 'grnyte.zeroStoreDropped'

// The explore map's block rows. Never a LEFT JOIN through PowerSync's views: SQLite cannot use the index through
// them and scans (6 s here); an inner join and correlated subqueries both search the index.
export const MAP_SQL = `select b.nid as id, b.name, b.grade_counts, a.nid as area_id, a.name as area_name, a.parent_fk,
    (select g.lat from geolocations g where g.nid = b.geolocation_fk) as lat,
    (select g.long from geolocations g where g.nid = b.geolocation_fk) as long
  from blocks b join areas a on a.nid = b.area_fk`

/** Where the service is, and whether it is the only engine running (the measurement build). The layout reads
 *  both from the environment, which only exists inside SvelteKit's runtime. */
export interface PowerSyncSettings {
  endpoint: string
  only: boolean
}

let settings: PowerSyncSettings = { endpoint: '', only: false }
let db: PowerSyncDatabase | undefined
let userId: string | undefined
let cleared = Promise.resolve()
/** Stops the open database's poll and status listener, so nothing it reports reaches the next account. */
let stopWatching = () => {}
// Raw: PowerSync hands over a new status object on every change and never mutates one.
let status = $state.raw<SyncStatus | undefined>(undefined)
/** The stamps this account has written since its file was opened, so the poll writes each once. */
let stamped: SyncStamp[] = []

/** Removes every account's local data from this device, open or not. */
export async function clearPowerSync(): Promise<void> {
  await closeCurrent()
  userId = undefined
  const files = (await indexedDB.databases())
    .map((info) => info.name ?? '')
    .filter((name) => name.startsWith(FILE_PREFIX))
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

  const opened = new PowerSyncDatabase({
    database: { dbFilename: `${FILE_PREFIX}${session.user.id}.sqlite` },
    schema: appSchema,
  })
  db = opened
  stamped = []
  trackSyncFor(session.user.id)
  // Every late callback checks it still belongs to the open account: a switch closes this one asynchronously.
  const current = () => db === opened
  void opened.waitForReady().then(() => current() && powerSyncOnly() && markStoreLoaded())
  observe(opened.currentStatus)
  const stopListening = opened.registerListener({ statusChanged: (next) => current() && observe(next) })
  const stopPolling = pollWhileVisible(opened)
  stopWatching = () => {
    stopPolling()
    stopListening()
  }

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

/** shortcut: the measurement build starts only PowerSync; goes when Zero leaves the client. */
export function powerSyncOnly(): boolean {
  return settings.only
}

export function powerSyncStatus(): SyncStatus | undefined {
  return status
}

/** Stops, clears and closes the open account's database, so its file can be deleted or another one opened. */
async function closeCurrent(): Promise<void> {
  stopWatching()
  stopWatching = () => {}
  const closing = db
  db = undefined
  await closing?.disconnectAndClear()
  await closing?.close()
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
  // The poll reads the same object until something changes.
  if (next === status) return
  status = next
  // While Zero syncs, the online signal and the stamps are Zero's: PowerSync's would vouch for Zero's store.
  if (!powerSyncOnly()) return
  reportSyncStatus(next)
  const reached: SyncStamp[] = []
  if (next.statusForPriority(0)?.hasSynced) reached.push('reference')
  if (next.hasSynced) reached.push('guidebook', 'personal')
  for (const stamp of reached) {
    if (stamped.includes(stamp)) continue
    stamped.push(stamp)
    markSynced(stamp)
  }
}

function pollWhileVisible(opened: PowerSyncDatabase): () => void {
  let timer: ReturnType<typeof setInterval> | undefined
  const sync = () => {
    clearInterval(timer)
    timer =
      document.visibilityState === 'visible' ? setInterval(() => observe(opened.currentStatus), POLL_MS) : undefined
  }
  sync()
  document.addEventListener('visibilitychange', sync)
  return () => {
    clearInterval(timer)
    document.removeEventListener('visibilitychange', sync)
  }
}
