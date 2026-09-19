import { beforeNavigate } from '$app/navigation'
import { updated } from '$app/state'
import { reportClientError } from '$lib/logging/report'
import { isOnline } from '$lib/state/online.svelte'
import { CLAIM_CHECK } from '$lib/state/serviceWorkerMessages'
import { isUpdateReady, setUpdateReady } from '$lib/state/updateReady.svelte'
import { onMount } from 'svelte'
import { pwaInfo } from 'virtual:pwa-info'

const UPDATE_CHECK_MS = 60 * 60 * 1000
const FOCUS_CHECK_MS = 60 * 1000

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
  beforeNavigate((navigation) => {
    if (!isUpdateReady() || navigation.willUnload || navigation.to == null) {
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
      setUpdateReady(true)

      // A document loaded after a deploy is already the new build, so stand down again. Kit's
      // `check()` returns false on any failure, and always false in dev: verify against preview.
      void updated
        .check()
        .then((isStale) => {
          if (!isStale) {
            setUpdateReady(false)
          }
        })
        .catch(() => {})
    }

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)
    handlesOwnUpdate = true

    // `sw.ts` claims before it pings, so a document mounting inside that window answers the ping and
    // misses `controllerchange`. Re-derive once. Only ever ARMS: the event path owns disarming.
    void updated
      .check()
      .then((isStale) => {
        if (isStale) {
          setUpdateReady(true)
        }
      })
      .catch(() => {})

    void import('virtual:pwa-register').then(({ registerSW }) => {
      registerSW({
        immediate: true,
        // Load-bearing despite being empty. `autoUpdate` reloads on workbox's `activated` unless this
        // is supplied (`if (onNeedReload) onNeedReload() else window.location.reload()`).
        onNeedReload: () => {},
        onRegisteredSW: (_swUrl, registration) => {
          if (disposed) {
            return
          }

          stopPolling = pollForUpdate(registration)
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
 * Hourly, plus on refocus at most once a minute, since the browser only checks on a document
 * navigation. An hour-gated refocus never fired: the interval re-stamps `lastCheckedAt` first.
 */
function pollForUpdate(registration: ServiceWorkerRegistration | undefined): () => void {
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
      // No pre-fetch: `updateViaCache` defaults to `imports`, so the spec sends `update()`'s own script
      // request with cache mode `no-cache`, and an unchanged worker answers 304 with no body.
      await registration.update()
    } catch {
      // Expected on a bad network. Left to reject, `hooks.client.ts` would write a `clientErrorLogs`
      // row per tab per hour.
    }
  }

  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible' && Date.now() - lastCheckedAt >= FOCUS_CHECK_MS) {
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
