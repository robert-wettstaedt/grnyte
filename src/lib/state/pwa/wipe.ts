import { PUBLIC_SUPABASE_URL } from '$env/static/public'
import { clearViewed } from '$lib/components/EntitySearch/recent.svelte'
import { IMAGE_CACHE } from '$lib/images/derivatives'
import { dropAllDatabases } from '@rocicorp/zero'
import { clearLocal } from '../engine'
import { clearHistory } from '../search/searchHistory'
import { forgetAllSynced } from '../sync.svelte'

/** A sign-out on the server tells no other tab; auth-js's own channel does. This tab's client hears it too, after
 *  `wipeAndLeave` has set the leaving flag that the (app) layout's listener checks: call it with that exit. */
export function tellOtherTabsSignedOut(): void {
  if (typeof BroadcastChannel === 'undefined') return
  const channel = new BroadcastChannel(`sb-${new URL(PUBLIC_SUPABASE_URL).hostname.split('.')[0]}-auth-token`)
  channel.postMessage({ event: 'SIGNED_OUT', session: null })
  channel.close()
}

/**
 * Removes what the previous account left on this device: its Zero replica, cached images, sync
 * stamps, search history and recently viewed entities. Every sign-out path calls it.
 */
export async function wipeDeviceData(): Promise<void> {
  forgetAllSynced()
  clearHistory()
  clearViewed()

  const [, dropped, local] = await Promise.allSettled([
    typeof caches === 'undefined' ? undefined : caches.delete(IMAGE_CACHE),
    dropAllDatabases(),
    clearLocal(),
  ])
  if (local.status === 'rejected') console.error('[wipe] local sync data left on this device', local.reason)
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

let leaving = false

/** True once this tab is on its way out; the layout's profile redirect must not race the exit. */
export const isLeaving = () => leaving
export const setLeaving = (value: boolean) => (leaving = value)

/** Every sign-out's exit: wipe (capped), then load `to`, or reload this URL; a reload drops in-memory views. */
export async function wipeAndLeave(to?: string): Promise<void> {
  leaving = true
  await Promise.race([wipeDeviceData(), new Promise((done) => setTimeout(done, WIPE_CAP_MS))])
  if (to == null) location.reload()
  else location.replace(to)
}
