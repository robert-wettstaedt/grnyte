import { browser } from '$app/environment'
import { PUBLIC_APPLICATION_NAME } from '$env/static/public'

/**
 * When this device last finished a sync, so an empty local store can be told apart from a crag that
 * genuinely has nothing in it.
 *
 * Two stamps, not one, because "finished" is two different claims and conflating them states an
 * absence as a fact:
 * - `reference` is the five small always-preloaded queries (grades, the signed-in user, roles,
 *   permissions, memberships). Fast, and enough to render the shell.
 * - `guidebook` is the crag itself: areas, blocks, routes and their trees, thousands of rows. Slow.
 *   Note this is narrower than the whole `field` policy, which also carries your own logbook and
 *   your regions' members. Those are small, they sit behind a user-id lookup that can fail on its
 *   own, and coupling the stamp to that lookup would make it claim less than it means.
 *
 * A device that finished the first and lost the connection partway through the second is the normal
 * shape of a sync at a crag, not a rare race. With one stamp it then claimed authority over a
 * guidebook it only partly had, so every area whose routes never arrived rendered as an area with no
 * routes, and because the stamp persists, it kept claiming that across reloads until some later
 * visit completed a full sync.
 *
 * Per device and per user in `localStorage`, never on `userSettings`. Settings are one row per
 * account, writable only through a server remote function, so they cannot be written while offline
 * and, after an eviction, they would sync back a timestamp some other device wrote. That is exactly
 * the wrong answer to "does *this* browser still have the guidebook".
 *
 * `localStorage` also outlives the thing it describes on purpose: browsers evict an origin's
 * IndexedDB and Cache Storage together, and Zero's own client-state-not-found path wipes its
 * database, but neither takes `localStorage` with it. A stamp with no replica behind it is the
 * signal we want, not a bug, which is why {@link forgetSynced} is called explicitly rather than
 * relying on the two disappearing together.
 */

/** Which body of data a stamp is about. See the note above; they are not interchangeable. */
export type SyncStamp = 'guidebook' | 'reference'

const KEY_PREFIX: Record<SyncStamp, string> = {
  // The reference stamp keeps its original key so an existing install is not read as never-synced.
  guidebook: `${PUBLIC_APPLICATION_NAME}.guidebookSyncedAt`,
  reference: `${PUBLIC_APPLICATION_NAME}.lastSyncedAt`,
}

const STAMPS: SyncStamp[] = ['guidebook', 'reference']

let syncedAt = $state<Record<SyncStamp, null | number>>({ guidebook: null, reference: null })
let trackedUser: string | undefined

/** Drops both stamps because the replica behind them is gone. */
export function forgetSynced(): void {
  if (!browser || trackedUser == null) {
    return
  }

  syncedAt = { guidebook: null, reference: null }

  for (const stamp of STAMPS) {
    try {
      localStorage.removeItem(key(stamp, trackedUser))
    } catch {
      // Nothing to do. The in-memory clear above is what the current page reads.
    }
  }
}

/**
 * Reactive. Milliseconds since the epoch, or null if this device has never finished that sync.
 *
 * Defaults to `reference`, which is what the cold-store screen's wording asks about.
 */
export function lastSyncedAt(stamp: SyncStamp = 'reference'): null | number {
  return syncedAt[stamp]
}

/** Records that a sync finished. Cheap to call repeatedly; only the newest value matters. */
export function markSynced(stamp: SyncStamp): void {
  if (!browser || trackedUser == null) {
    return
  }

  const at = Date.now()
  syncedAt = { ...syncedAt, [stamp]: at }

  try {
    localStorage.setItem(key(stamp, trackedUser), String(at))
  } catch {
    // In-memory value still stands for this page, and the next successful sync tries again.
  }
}

/**
 * Points the module at the signed-in user and loads their stamps. Call once per Zero client, before
 * anything reads {@link lastSyncedAt}.
 */
export function trackSyncFor(userID: string | undefined): void {
  trackedUser = userID
  syncedAt = { guidebook: null, reference: null }

  if (!browser || userID == null) {
    return
  }

  syncedAt = { guidebook: read('guidebook', userID), reference: read('reference', userID) }
}

function key(stamp: SyncStamp, userID: string): string {
  return `${KEY_PREFIX[stamp]}.${userID}`
}

function read(stamp: SyncStamp, userID: string): null | number {
  try {
    // `Number('')` is 0, not NaN, so an empty or whitespace value would read as a real stamp at the
    // epoch and tell a device with nothing to restore to reconnect and restore it. Only `markSynced`
    // writes here so it cannot happen today; the guard costs one condition and does not rely on that
    // staying true.
    const raw = localStorage.getItem(key(stamp, userID))?.trim()
    const parsed = raw == null || raw === '' ? Number.NaN : Number(raw)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
  } catch {
    // Storage refused the read (private mode, disabled cookies). Degrades to "never synced", which
    // only costs a returning user one honest "reconnect to restore" instead of a silent empty page.
    return null
  }
}
