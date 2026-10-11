import { clearViewed } from '$lib/components/EntitySearch/recent.svelte'
import { IMAGE_CACHE } from '$lib/images/derivatives'
import { dropAllDatabases } from '@rocicorp/zero'
import { clearHistory } from './searchHistory'
import { forgetAllSynced } from './sync.svelte'

/**
 * Removes what the previous account left on this device: its Zero replica, cached images, sync
 * stamps, search history and recently viewed entities. Every sign-out path calls it.
 */
export async function wipeDeviceData(): Promise<void> {
  forgetAllSynced()
  clearHistory()
  clearViewed()

  const [, dropped] = await Promise.allSettled([
    typeof caches === 'undefined' ? undefined : caches.delete(IMAGE_CACHE),
    dropAllDatabases(),
  ])
  // A replica left behind is the thing this exists to prevent, so it is reported, not swallowed.
  if (dropped.status === 'rejected' || dropped.value.errors.length > 0) {
    console.error(
      '[wipe] replicas left on this device',
      dropped.status === 'rejected' ? dropped.reason : dropped.value.errors,
    )
  }
}

/** A stuck IndexedDB delete must not keep a signed-out person on the old screen. */
const WIPE_CAP_MS = 3000

/** Every sign-out's exit: wipe (capped), then load `to`, or reload this URL; a reload drops in-memory views. */
export async function wipeAndLeave(to?: string): Promise<void> {
  await Promise.race([wipeDeviceData(), new Promise((done) => setTimeout(done, WIPE_CAP_MS))])
  if (to == null) location.reload()
  else location.replace(to)
}
