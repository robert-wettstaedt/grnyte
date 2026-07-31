/// <reference lib="WebWorker" />
/// <reference types="vite/client" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />

import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { imageCache } from 'workbox-recipes'
import { isDerivativeRequest } from './lib/images/derivatives'
import { NotificationDataSchema, NotificationSchema } from './lib/notifications'

declare let self: ServiceWorkerGlobalScope

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// Prerendered static shell (see src/routes/offline) cached at install so a cold
// offline start has an HTML document to boot the client app from.
const OFFLINE_SHELL = '/offline'
const OFFLINE_CACHE = 'offline-shell'

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(OFFLINE_CACHE).then((cache) => cache.add(OFFLINE_SHELL)))
})

// Navigations are network-first (so online visitors get fresh SSR), falling back
// to the cached shell when offline.
self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') {
    return
  }

  event.respondWith(
    fetch(event.request).catch(async () => {
      const url = new URL(event.request.url)

      // Already loading the shell itself → return the cached copy.
      if (url.pathname === OFFLINE_SHELL) {
        const cached = await caches.match(OFFLINE_SHELL, { ignoreSearch: true })
        if (cached != null) {
          return cached
        }
      }

      // Bounce other offline navigations to the shell, carrying the original
      // path so it can route there client-side from Zero's local store.
      return Response.redirect(`${OFFLINE_SHELL}?redirect=${encodeURIComponent(url.pathname + url.search)}`, 302)
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
 * ponytail: 200 entries, roughly 5MB of 256px webp. Raise it if browsing one big area
 * evicts the previous one.
 */
imageCache({
  matchCallback: ({ sameOrigin, url }) => sameOrigin && isDerivativeRequest(url),
  maxEntries: 200,
})

self.addEventListener('push', (event) => {
  if (!event.data) return

  try {
    const data = event.data.json()
    const newNotification = NotificationSchema.parse(data)

    const options: NotificationOptions = {
      badge: '/pwa-192x192.png',
      body: newNotification.body,
      data: newNotification.data,
      icon: newNotification.icon ?? '/pwa-192x192.png',
    }

    async function mergeNotifications() {
      const existingNotifications = await self.registration.getNotifications({ tag: newNotification.tag })
      let notificationCount = existingNotifications.length

      for (const existingNotification of existingNotifications) {
        if (newNotification.tag == existingNotification.tag) {
          existingNotification.close()
          options.body = `${options.body}\n${existingNotification.body}`
          notificationCount--
        }
      }

      if ('setAppBadge' in self.navigator) {
        try {
          await self.navigator.setAppBadge(notificationCount)
        } catch {
          console.log('failed to setAppBadge')
        }
      }

      return self.registration.showNotification(newNotification.title ?? 'New activity', options)
    }

    event.waitUntil(mergeNotifications())
  } catch (error) {
    console.error('Error showing notification:', error)
  }
})

self.addEventListener('notificationclick', (event) => {
  const notification = event.notification
  const action = event.action
  const data = NotificationDataSchema.parse(notification.data)

  notification.close()

  if (action && data && data.pathname) {
    event.waitUntil(self.clients.openWindow(data.pathname))
    return
  }

  // If no specific action, just focus on the app if it's open
  event.waitUntil(
    self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then(async (windowClients) => {
      if (windowClients.at(0) == null) {
        return self.clients.openWindow(data.pathname ?? '/')
      } else {
        const url = new URL(windowClients[0].url)
        url.pathname = data.pathname ?? '/'
        await windowClients[0].focus()
        return windowClients[0].navigate(url)
      }
    }),
  )
})
