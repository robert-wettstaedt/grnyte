/// <reference lib="WebWorker" />
/// <reference types="vite/client" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />

import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare let self: ServiceWorkerGlobalScope

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  try {
    const url = new URL(event.request.url)

    if (url.hostname === 'tile.openstreetmap.org' || url.hostname === 'geoservices.bayern.de') {
      event.respondWith(cacheResponse(event.request, 'tiles'))
    } else if (url.pathname.startsWith('/nextcloud/')) {
      event.respondWith(cacheResponse(event.request, 'nextcloud'))
    } else {
      event.respondWith(fetch(event.request))
    }
  } catch (error) {
    console.error('Service Worker fetch error:', error)
    event.respondWith(fetch(event.request))
  }
})

// self.__WB_MANIFEST is default injection point
precacheAndRoute(self.__WB_MANIFEST)

// clean old assets
cleanupOutdatedCaches()

let allowlist: undefined | RegExp[]
if (import.meta.env.DEV) allowlist = [/^\/$/]

// to allow work offline
registerRoute(new NavigationRoute(createHandlerBoundToURL('/'), { allowlist }))

async function cacheResponse(request: Request, cacheName: string) {
  try {
    const cache = await caches.open(cacheName)
    const cachedResponse = await cache.match(request)

    if (cachedResponse) {
      return cachedResponse
    }

    const networkResponse = await fetch(request.clone())

    if (!networkResponse.ok) {
      throw new Error(`Network response was not ok: ${networkResponse.status}`)
    }

    await cache.put(request, networkResponse.clone())
    return networkResponse
  } catch (error) {
    console.error(`Cache response error for ${cacheName}:`, error)
    return fetch(request)
  }
}
