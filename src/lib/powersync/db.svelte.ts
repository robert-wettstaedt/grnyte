import { browser } from '$app/environment'
import type { PowerSyncBackendConnector, SyncStatus } from '@powersync/web'
import { PowerSyncDatabase } from '@powersync/web'
import type { Session } from '@supabase/supabase-js'
import { appSchema } from './schema'

// shortcut: the local dev service only; 4.1 reads PUBLIC_POWERSYNC_URL instead.
const ENDPOINT = 'http://localhost:58080'

// The explore map's block rows. Never a LEFT JOIN through PowerSync's views: SQLite cannot use the index through
// them and scans (6 s here); an inner join and correlated subqueries both search the index.
export const MAP_SQL = `select b.nid as id, b.name, b.grade_counts, a.nid as area_id, a.name as area_name, a.parent_fk,
    (select g.lat from geolocations g where g.nid = b.geolocation_fk) as lat,
    (select g.long from geolocations g where g.nid = b.geolocation_fk) as long
  from blocks b join areas a on a.nid = b.area_fk`

let db: PowerSyncDatabase | undefined
let token: string | undefined
let userId: string | undefined
let cleared = Promise.resolve()
let status = $state<SyncStatus | undefined>(undefined)

const connector: PowerSyncBackendConnector = {
  fetchCredentials: async () => (token == null ? null : { endpoint: ENDPOINT, token }),
  // Nothing writes to the local database: writes stay server mutators until the offline-writes PR.
  uploadData: async () => {},
}

/** Sign-out's half: clears the client this document opened. shortcut: a sign-out from a page without one (invite
 *  accept) leaves that account's file, readable only by it; delete every `trial3-*` file in a real port. */
export async function clearPowerSync(): Promise<void> {
  await db?.disconnectAndClear()
}

export function getPowerSync(): PowerSyncDatabase {
  if (db == null) throw new Error('PowerSync is not initialized: initPowerSync(session) must run first')
  return db
}

export function initPowerSync(session: null | Session | undefined): void {
  if (!browser) return
  // shortcut: collections built on a dropped client stay on it; fine while every sign-out reloads the page.
  if (db != null && userId !== session?.user.id) {
    cleared = db.disconnectAndClear().catch((error: unknown) => console.error('[powersync] clear failed', error))
    db = undefined
  }
  userId = session?.user.id
  if (session == null) {
    token = undefined
    return
  }
  const fresh = token !== session.access_token
  token = session.access_token
  if (db == null) {
    // One file per account, so no account ever opens another's rows or upload queue, reload or not.
    db = new PowerSyncDatabase({ database: { dbFilename: `trial3-${session.user.id}.sqlite` }, schema: appSchema })
    db.registerListener({ statusChanged: (next) => (status = next) })
    status = db.currentStatus
  } else if (!fresh) {
    return
  }
  const connecting = db
  void cleared.then(() => connecting.connect(connector))
}

export function powerSyncStatus(): SyncStatus | undefined {
  return status
}
