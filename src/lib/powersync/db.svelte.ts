import { browser } from '$app/environment'
import { reportSyncStatus } from '$lib/state/online.svelte'
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
let stopPolling = () => {}
// Raw: PowerSync hands over a new status object on every change and never mutates one.
let status = $state.raw<SyncStatus | undefined>(undefined)
/** The stamps this account has written since its file was opened, so the poll writes each once. */
let stamped: SyncStamp[] = []

/** Removes every account's local data from this device, open or not. Sign-out's half. */
export async function clearPowerSync(): Promise<void> {
  stopPolling()
  await db?.disconnectAndClear()
  await db?.close()
  db = undefined
  userId = undefined
  const files = (await indexedDB.databases())
    .map((info) => info.name ?? '')
    .filter((name) => name.startsWith(FILE_PREFIX))
  await Promise.all(files.map((name) => deleteDatabase(name)))
}

/** Drops the previous engine's local store once per device: it would otherwise keep a second copy of every region. */
export async function dropZeroStoreOnce(): Promise<void> {
  if (localStorage.getItem(ZERO_DROPPED_KEY) != null) return
  const { errors } = await dropAllDatabases()
  if (errors.length === 0) localStorage.setItem(ZERO_DROPPED_KEY, '1')
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
    const previous = db
    cleared = previous.disconnectAndClear().catch((error: unknown) => console.error('[powersync] clear failed', error))
    stopPolling()
    db = undefined
  }
  userId = session?.user.id
  if (session == null || db != null) return

  // One file per account, so no account ever opens another's rows.
  const opened = new PowerSyncDatabase({
    database: { dbFilename: `${FILE_PREFIX}${session.user.id}.sqlite` },
    schema: appSchema,
  })
  db = opened
  stamped = []
  trackSyncFor(session.user.id)
  void opened.waitForReady().then(markStoreLoaded)
  observe(opened.currentStatus)
  opened.registerListener({ statusChanged: observe })
  stopPolling = pollWhileVisible(opened)

  const connector: PowerSyncBackendConnector = {
    fetchCredentials: async () => {
      const token = await accessToken()
      return token == null ? null : { endpoint: settings.endpoint, token }
    },
    // Nothing writes to the local database: writes stay server mutators until the offline-writes PR.
    uploadData: async () => {},
  }
  void cleared.then(() => opened.connect(connector))
}

/** The measurement build: only PowerSync starts, so the remeasure runs on one engine. Removed in R1. */
export function powerSyncOnly(): boolean {
  return settings.only
}

export function powerSyncStatus(): SyncStatus | undefined {
  return status
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(name)
    request.onsuccess = request.onerror = request.onblocked = () => resolve()
  })
}

/** Takes a status in and writes the stamps the shell reads: the essentials (priority 0), then everything. */
function observe(next: SyncStatus): void {
  status = next
  // Zero reports while it syncs; only the measurement build leaves the online signal to PowerSync.
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
