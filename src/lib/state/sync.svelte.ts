import { browser } from '$app/environment'
import { PUBLIC_APPLICATION_NAME } from '$env/static/public'

/**
 * When this device last had a complete sync, so an empty local store can be told apart from a crag
 * that genuinely has nothing in it.
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

const KEY_PREFIX = `${PUBLIC_APPLICATION_NAME}.lastSyncedAt`

let syncedAt = $state<null | number>(null)
let trackedUser: string | undefined

/** Drops the stamp because the replica behind it is gone. */
export function forgetSynced(): void {
  if (!browser || trackedUser == null) {
    return
  }

  syncedAt = null

  try {
    localStorage.removeItem(key(trackedUser))
  } catch {
    // Nothing to do. The in-memory clear above is what the current page reads.
  }
}

/** Reactive. Milliseconds since the epoch, or null if this device has never completed a sync. */
export function lastSyncedAt(): null | number {
  return syncedAt
}

/** Records that a sync completed. Cheap to call repeatedly; only the newest value matters. */
export function markSynced(): void {
  if (!browser || trackedUser == null) {
    return
  }

  const at = Date.now()
  syncedAt = at

  try {
    localStorage.setItem(key(trackedUser), String(at))
  } catch {
    // In-memory value still stands for this page, and the next successful sync tries again.
  }
}

/**
 * Points the module at the signed-in user and loads their stamp. Call once per Zero client, before
 * anything reads {@link lastSyncedAt}.
 */
export function trackSyncFor(userID: string | undefined): void {
  trackedUser = userID
  syncedAt = null

  if (!browser || userID == null) {
    return
  }

  try {
    // `Number('')` is 0, not NaN, so an empty or whitespace value would read as a real stamp at the
    // epoch and tell a device with nothing to restore to reconnect and restore it. Only `markSynced`
    // writes here so it cannot happen today; the guard costs one condition and does not rely on that
    // staying true.
    const raw = localStorage.getItem(key(userID))?.trim()
    const parsed = raw == null || raw === '' ? Number.NaN : Number(raw)
    syncedAt = Number.isFinite(parsed) && parsed > 0 ? parsed : null
  } catch {
    // Storage refused the read (private mode, disabled cookies). Degrades to "never synced", which
    // only costs a returning user one honest "reconnect to restore" instead of a silent empty page.
    syncedAt = null
  }
}

function key(userID: string): string {
  return `${KEY_PREFIX}.${userID}`
}
