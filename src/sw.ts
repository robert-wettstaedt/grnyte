/// <reference lib="WebWorker" />
/// <reference types="vite/client" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />

import type { Pathname } from '$app/types'
import { ExpirationPlugin } from 'workbox-expiration'
import { cleanupOutdatedCaches, matchPrecache, precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies'
import { isPushPayload, type PushPayload } from './lib/entities/notification/push'
import { isDerivativeRequest } from './lib/images/derivatives'

declare let self: ServiceWorkerGlobalScope

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

/**
 * Take over as soon as this worker is ready, rather than waiting for every tab on the origin to
 * close first.
 *
 * Without these two, a new worker installs and then sits in `waiting` indefinitely: the default
 * lifecycle hands over only when the last client of the old worker goes away, and `registerSW`'s
 * `immediate: true` does not change that (it controls when registration is *attempted*, not which
 * worker wins). Nothing in the app posts the `SKIP_WAITING` message above, so in practice a
 * service worker fix never reached anybody who keeps a tab open — including, for a while, us:
 * the offline work looked broken because the browser was still running the previous worker.
 *
 * The usual argument for waiting is version skew, a running page suddenly served assets from a
 * newer precache. SvelteKit does NOT cover that for us, contrary to what this comment used to
 * claim: `version.pollInterval` defaults to 0 and `svelte.config.js` does not set it, so the version
 * is only consulted after a route module fails to load or a navigation returns >= 400. Skew
 * self-heals through a failure rather than ahead of one, and offline that failure is terminal.
 *
 * Accepted anyway, because the alternative is strictly worse: a worker that activates only once
 * every tab has closed means a service worker fix reaches nobody, which is exactly how this
 * offline work looked broken for a day.
 */
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// Prerendered static shell (see src/routes/offline) cached at install so a cold
// offline start has an HTML document to boot the client app from.
const OFFLINE_SHELL: Pathname = '/offline'
const OFFLINE_CACHE = 'offline-shell'

/**
 * SvelteKit's `$env/dynamic/public` module. The server generates it per request, so unlike
 * everything under `_app/immutable` it is not a build artifact and `injectManifest`'s glob never
 * sees it.
 *
 * What needs it is the shell itself, not any one import. An SSR'd page gets its dynamic public env
 * inlined into the HTML; a *prerendered* page cannot, so SvelteKit emits a runtime gate instead.
 * Read `build/prerendered/offline.html`: it ships `env: null` and wraps the entire client boot in
 * `import("/_app/env.js").then(({ env }) => ...)`. Nothing runs until that resolves.
 *
 * So this stays load-bearing no matter what any component imports. An earlier version of this
 * comment blamed a client import of `$env/dynamic/public`, which would have made the whole block
 * look safe to delete the day that import went away.
 *
 * That made it the single point of failure for the whole offline story: every other chunk came back
 * from the precache and this one request failed, so the module graph never resolved, the app never
 * booted, and the shell sat there empty. Cached at install so it is present before it is ever
 * needed, and refreshed at runtime below so a deploy that changes it is picked up.
 */
const DYNAMIC_ENV = '/_app/env.js'

self.addEventListener('install', (event) => {
  // No `catch`. This used to swallow its own rejection, on the reasoning that losing the env module
  // should not also cost us the shell, and that had it backwards: a shell without the env module is
  // not a degraded offline mode, it is a shell that hangs forever on an import nobody can see fail -
  // no console error, no visible failure, just a page that never boots.
  //
  // Failing the install is the recoverable outcome. The worker does not activate, the previous one
  // stays, and the browser retries on a later navigation. Half-installing is the one that strands
  // somebody at a crag.
  //
  // The shell is not here: it is prerendered, so `precacheAndRoute` already carries it. That is not
  // a weaker guarantee, because atomicity comes from the event rather than from sharing a call -
  // `PrecacheController` registers its own `install` listener and `waitUntil`s it, this listener
  // `waitUntil`s that, and one rejection fails the install for both.
  event.waitUntil(caches.open(OFFLINE_CACHE).then((cache) => cache.add(DYNAMIC_ENV)))
})

// Serve the cached copy immediately and refresh it in the background. Network-first would put a
// timeout on the critical path of every cold boot for a file that changes only on deploy.
registerRoute(
  ({ sameOrigin, url }) => sameOrigin && url.pathname === DYNAMIC_ENV,
  new StaleWhileRevalidate({ cacheName: OFFLINE_CACHE }),
)

/**
 * Navigations are network-first (so online visitors get fresh SSR), falling back to the cached
 * shell when offline.
 *
 * The shell is served *at the requested URL* rather than redirected to. It used to bounce to
 * `/offline?redirect=<path>` and hand off client-side, which cost a round trip through a second
 * document, showed the wrong URL in the address bar the whole time, and — the reason it had to go —
 * made rendering the requested page depend on the shell's own JavaScript booting first. Serving the
 * shell in place means SvelteKit starts up already on `/routes/123` and renders it straight from
 * Zero's local store, which is the entire point of keeping that store.
 *
 * The shell is prerendered with `ssr = false` (see `src/routes/offline/+page.ts`), so it carries no
 * route-specific markup or payload to conflict with whatever URL it is answering for.
 */
self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') {
    return
  }

  event.respondWith(
    fetch(event.request).catch(async () => {
      // By name, out of the precache, with no second copy behind it. A bare `caches.match` was
      // scanning every cache in creation order and answering from whichever held the shell first,
      // which worked only because a duplicate copy happened to exist; "works by cache creation
      // order" is not what belongs under the one request the whole offline story depends on.
      //
      // The manifest records this URL relative (`offline`, no leading slash) and the constant here
      // has a leading slash, which looks like it should matter and does not: Workbox absolutises
      // both sides with `new URL(x, location.href)` - on ingest in `createCacheKey` and on lookup in
      // `getCacheKeyForURL` - so the relative form never survives ingest. `location.href` in a worker
      // is the worker's own URL, and this one is served from the origin root, so both resolve to
      // `<origin>/offline`. The one thing that would break that is moving the worker into a
      // subdirectory, i.e. setting `paths.base`, and `app-server-loads.test.ts`'s neighbour asserts
      // the shell is in the manifest so a config change that drops it fails a test rather than
      // offline.
      const cached = await matchPrecache(OFFLINE_SHELL)
      // Nothing cached means the install never completed; there is nothing better to offer than the
      // browser's own failure page.
      return cached ?? Response.error()
    }),
  )
})

/**
 * Keep browsed images available offline. The HTTP `max-age` the /image route sends is not
 * enough on its own: it makes a repeat view cheap, but the offline fallback above boots the
 * app from Zero's local store, and a topo whose bytes only live in the HTTP cache is not
 * guaranteed to be there. CacheFirst puts them somewhere we control.
 *
 * Matches only same-origin `?w=` requests, i.e. the generated derivatives, which the route
 * serves as `immutable` because they are stable per (path, width) - exactly what CacheFirst
 * needs to be correct. A bare `/image/<path>` is the full-res original the viewer loads;
 * caching those would evict the whole bucket for one photo. Bunny video thumbnails are
 * cross-origin (opaque responses, charged at full padded size), so they stay out too.
 *
 * Registered by hand rather than through `workbox-recipes`' `imageCache`, which cannot express
 * "no age limit": it does `options.maxAgeSeconds || 30 * 24 * 60 * 60`, so both `0` and `undefined`
 * restore 30 days, and passing a second ExpirationPlugin does not override the recipe's, it
 * intersects with it over one shared IndexedDB store and the stricter limit wins. That 30 days was
 * an offline wall rather than staleness: `Date` on a cached response never refreshes, so a month
 * after a topo was last fetched the plugin refuses the cached copy and CacheFirst falls through to
 * the network, which offline is precisely the thing that cannot happen. The topo was simply gone on
 * the one day of the year it was needed.
 *
 * `cacheName` is load-bearing twice over: ExpirationPlugin throws if it gets the default runtime
 * name, and keeping the recipe's literal `images` means the existing cache carries over on deploy
 * rather than everyone re-downloading. No CacheableResponsePlugin: the matcher is same-origin only,
 * so opaque responses cannot arrive, and the strategy already declines to cache anything but a 200.
 *
 * ponytail: 1000 entries, roughly 25MB of 256px webp against a multi-GB quota. Eviction is true LRU
 * on read, not on write, so the areas somebody keeps opening are the ones that survive.
 */
registerRoute(
  ({ request, sameOrigin, url }) => request.destination === 'image' && sameOrigin && isDerivativeRequest(url),
  new CacheFirst({
    cacheName: 'images',
    plugins: [new ExpirationPlugin({ maxEntries: 1000 })],
  }),
)

/**
 * Show what the server sent, and nothing it did not.
 *
 * Three rules, all of which the 1.0 handler got wrong in ways nobody could see:
 *
 * - **Replace by tag, never concatenate.** A digest is a complete restatement of what is waiting,
 *   so the new one replaces the last. Appending the old body to the new one produced a
 *   notification that grew every five minutes and repeated itself.
 * - **The badge comes from the payload.** How many OS notifications happen to be lying around is
 *   not the number of unread things in the inbox, and it was being used as if it were.
 * - **Do not buzz somebody who is looking at the app.** Silently, though, never nothing at all:
 *   see {@link showFor}.
 */
self.addEventListener('push', (event) => {
  if (!event.data) return

  const payload = readJson(event.data)

  if (!isPushPayload(payload)) {
    console.error('[push] unrecognised payload', payload)
    return
  }

  event.waitUntil(
    (async () => {
      if (payload.badge != null && 'setAppBadge' in self.navigator) {
        try {
          await (payload.badge > 0 ? self.navigator.setAppBadge(payload.badge) : self.navigator.clearAppBadge())
        } catch {
          // The permission can be revoked at any time. Nothing to do and nobody to tell.
        }
      }

      // `focused`, not `visibilityState`: a tab can be the visible one in its own window while
      // the reader is working in another application entirely, and that person should still be
      // told. Only somebody actually looking at the app is spared the buzz.
      const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' })
      await showFor(
        payload,
        clients.some((client) => client.focused),
      )
    })(),
  )
})

/**
 * The payload as JSON, or `undefined` for anything that is not.
 *
 * `PushMessageData.json()` throws on a body this deployment did not write (a sender from an older
 * release, a probe, a partially decrypted body), and a throw inside the push listener means no
 * notification at all - which is exactly the silent push the subscription promised never to send.
 */
function readJson(data: PushMessageData): unknown {
  try {
    return data.json()
  } catch (error) {
    console.error('[push] unparseable payload', error)
    return undefined
  }
}

/**
 * Show it, quietly when somebody is already looking at the app.
 *
 * Quietly rather than not at all, which is the part that is not a preference: the subscription is
 * created `userVisibleOnly`, a promise that every push shows something. Firefox counts the ones
 * that show nothing against a per-origin budget and drops the subscription when it runs out, so
 * "skip it while they are reading" would end push on that device, permanently, with nothing in the
 * app able to notice.
 */
function showFor(payload: PushPayload, focused: boolean): Promise<void> {
  return self.registration.showNotification(payload.title, {
    badge: '/pwa-192x192.png',
    body: payload.body,
    data: { pathname: payload.pathname },
    icon: '/pwa-192x192.png',
    // Alert again on replacement. `renotify` defaults to false, which would make every digest
    // after the first silently swap the text under a notification nobody looked at - and with
    // a 20-minute quiet period, replacement is the normal case rather than the exception. It
    // requires a tag, which the payload schema makes mandatory.
    renotify: !focused,
    silent: focused,
    tag: payload.tag,
  })
}

self.addEventListener('notificationclick', (event) => {
  const notification = event.notification
  const action = event.action
  const data = (notification.data ?? {}) as { pathname?: string }

  notification.close()

  if (action && data.pathname != null) {
    event.waitUntil(self.clients.openWindow(data.pathname))
    return
  }

  // If no specific action, just focus on the app if it's open
  event.waitUntil(
    self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then(async (windowClients) => {
      if (windowClients.at(0) == null) {
        return self.clients.openWindow(data.pathname ?? '/')
      } else {
        // Resolved against the open window rather than assigned to its `pathname`: what the push
        // carries is a whole path, and a comment's is `/events/12?comment=45`. Assigning that to
        // `pathname` percent-encodes the `?` into the route parameter, so the reader lands on an
        // event id no row has.
        const url = new URL(data.pathname ?? '/', windowClients[0].url)
        await windowClients[0].focus()
        return windowClients[0].navigate(url)
      }
    }),
  )
})
