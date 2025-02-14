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
  const url = new URL(event.request.url)

  if (url.hostname === 'tile.openstreetmap.org' || url.hostname === 'geoservices.bayern.de') {
    event.respondWith(cacheResponse(event.request, 'tiles'))
  } else if (url.pathname.startsWith('/nextcloud/')) {
    event.respondWith(cacheResponse(event.request, 'nextcloud'))
  } else {
    console.log(event)
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
  let response = await caches.match(request)

  if (response) {
    return response
  }

  response = await fetch(request)
  const cache = await caches.open(cacheName)
  const clonedResponse = response.clone()
  await cache.put(request, clonedResponse)
  return response
}
