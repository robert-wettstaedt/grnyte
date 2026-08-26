import { beforeNavigate } from '$app/navigation'
import { updated } from '$app/state'
import { reportClientError } from '$lib/logging/report'
import { isOnline } from '$lib/state/online.svelte'
import { CLAIM_CHECK } from '$lib/state/serviceWorkerMessages'
import { onMount } from 'svelte'
import { pwaInfo } from 'virtual:pwa-info'

const UPDATE_CHECK_MS = 60 * 60 * 1000

/**
 * Register once from the root layout: registers the worker, and hard-navigates at the next screen
 * change once a new worker has taken over.
 *
 * `vite.config.ts` must stay on `registerType: 'autoUpdate'`, because `'prompt'` hangs its reload on
 * workbox-window's `waiting` event and `sw.ts` skips waiting, which workbox deliberately does not
 * report ("This timeout is used to ignore cases where the service worker calls `skipWaiting()` in
 * the install event", `Workbox.js` at `WAITING_TIMEOUT_DURATION`). `sw.size.test.ts` guards the pair.
 *
 * `beforeNavigate`, not `afterNavigate`: `cleanupOutdatedCaches()` drops the old precache, so the
 * next route `import()` 404s, and Kit answers that by returning from the navigation before
 * `afterNavigate` runs. Offline it then shows an error page instead. Going first preempts the chunk
 * fetch, and offline the full navigation is what `sw.ts` answers with the precached shell.
 */
export function registerServiceWorker(): void {
  let staleSinceActivate = false

  beforeNavigate((navigation) => {
    if (!staleSinceActivate || navigation.willUnload || navigation.to == null) {
      return
    }

    // A query-only change is the same screen: the lightbox paging a photo, the map filter sheet's
    // Apply. Reloading there is the mid-interaction reload this indirection exists to avoid. The
    // flag survives for the next real change.
    if (navigation.to.url.pathname === navigation.from?.url.pathname) {
      return
    }

    location.href = navigation.to.url.href
  })

  onMount(() => {
    // `pwaInfo` is a build-time constant and says nothing about this browser: Firefox private
    // windows and non-secure contexts have no `navigator.serviceWorker` to attach to.
    if (pwaInfo == null || !('serviceWorker' in navigator)) {
      return
    }

    // `.then` rather than an async callback below, so this can return a teardown synchronously.
    let stopPolling = () => {}
    let disposed = false

    /** Tells `sw.ts` to leave this page to reload itself rather than navigating it out from under
     * whoever is typing. Only honest once `onControllerChange` is attached, which is why it is set
     * there and not after registration resolves: the worker pings within seconds of a first install,
     * long before that dynamic import lands. */
    let handlesOwnUpdate = false

    const onMessage = (event: MessageEvent) => {
      if (handlesOwnUpdate && event.data?.type === CLAIM_CHECK) {
        event.ports[0]?.postMessage(true)
        event.ports[0]?.close()
      }
    }

    navigator.serviceWorker.addEventListener('message', onMessage)

    // Messages from the controlling worker stay queued until the document finishes loading unless
    // this is called, which would put the ping past the worker's deadline on a slow phone.
    navigator.serviceWorker.startMessages()

    /**
     * Native `controllerchange`, deliberately not vite-pwa's `onNeedReload`: workbox-window drops its
     * `updatefound` listener on the first update it calls external, and the poll below makes every
     * update external after 60s, so it observes one update per document and goes silent after.
     * `controllerchange` fires on every `clients.claim()`, every time.
     */
    const onControllerChange = () => {
      staleSinceActivate = true

      // A document loaded after a deploy is already the new build and still sees this. `check()`
      // compares the baked version against `_app/version.json`, which `kit.includeVersionFile`
      // precaches, so it answers offline too. Only ever disarms: a check that cannot answer leaves
      // the flag set, because a needless reload beats a reader stuck on a build whose chunks are gone.
      void updated
        .check()
        .then((isStale) => {
          if (!isStale) {
            staleSinceActivate = false
          }
        })
        .catch(() => {})
    }

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)
    handlesOwnUpdate = true

    void import('virtual:pwa-register').then(({ registerSW }) => {
      registerSW({
        immediate: true,
        // Load-bearing despite being empty. `autoUpdate` runs `onNeedReload ?? location.reload()`, so
        // omitting it does not mean "do nothing", it means reload the instant a worker activates.
        onNeedReload: () => {},
        onRegisteredSW: (swUrl, registration) => {
          if (disposed) {
            return
          }

          stopPolling = pollForUpdate(swUrl, registration)
        },
        // A failed registration takes the offline shell, the image cache and push with it, and the
        // plugin swallows the rejection. Nothing else would say so.
        onRegisterError: reportClientError,
      })
    })

    return () => {
      // `disposed` too, because registration can resolve after this runs and would start a poller
      // with nothing left to stop it.
      disposed = true
      navigator.serviceWorker.removeEventListener('message', onMessage)
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
      stopPolling()
    }
  })
}

/**
 * Ask whether a newer worker exists, hourly and on returning to the foreground.
 *
 * The browser only checks on a *document* navigation, and this app almost never does one. The
 * visibility half is not redundant: a frozen tab runs no timers, so an installed PWA coming back
 * after a week would otherwise wait up to another hour.
 *
 * An hour, not the 20s 1.0 shipped: this is a request per open tab, forever, for a file that changes
 * only on deploy.
 */
function pollForUpdate(swUrl: string, registration: ServiceWorkerRegistration | undefined): () => void {
  if (registration == null) {
    return () => {}
  }

  let lastCheckedAt = Date.now()

  const check = async () => {
    // `isOnline()`, since `online.svelte.ts` documents `navigator.onLine` as untrustworthy in exactly
    // this direction: a captive portal reads as online, which is the normal state at a crag.
    if (registration.installing || !isOnline()) {
      return
    }

    lastCheckedAt = Date.now()

    try {
      const response = await fetch(swUrl, { cache: 'no-store', headers: { 'cache-control': 'no-cache' } })

      if (response.status === 200) {
        await registration.update()
      }
    } catch {
      // Expected on a bad network. Left to reject, `hooks.client.ts` would write a `clientErrorLogs`
      // row per tab per hour.
    }
  }

  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible' && Date.now() - lastCheckedAt >= UPDATE_CHECK_MS) {
      void check()
    }
  }

  const interval = setInterval(() => void check(), UPDATE_CHECK_MS)
  document.addEventListener('visibilitychange', onVisibilityChange)

  return () => {
    clearInterval(interval)
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }
}
