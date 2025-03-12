/// <reference lib="WebWorker" />
/// <reference types="vite/client" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />

import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'

declare let self: ServiceWorkerGlobalScope

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

// self.__WB_MANIFEST is default injection point
precacheAndRoute(self.__WB_MANIFEST)

// clean old assets
cleanupOutdatedCaches()

// Handle push events for notifications
self.addEventListener('push', (event) => {
  if (!event.data) return

  try {
    const data = event.data.json()

    const options = {
      body: data.body || 'New notification',
      icon: data.icon || '/android-chrome-192x192.png',
      badge: '/android-chrome-192x192.png',
      data: data.data || {},
      actions: data.actions || [],
      requireInteraction: data.requireInteraction || false,
    }

    event.waitUntil(self.registration.showNotification(data.title, options))
  } catch (error) {
    console.error('Error showing notification:', error)
  }
})

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  const notification = event.notification
  const action = event.action
  const data = notification.data

  notification.close()

  // If the action is "open", open the URL provided in the data
  if (action === 'open' && data && data.url) {
    event.waitUntil(self.clients.openWindow(data.url))
    return
  }

  // Handle custom actions
  if (action && data && data.actions && data.actions[action]) {
    event.waitUntil(self.clients.openWindow(data.actions[action]))
    return
  }

  // If no specific action, just focus on the app if it's open
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clientList) => {
      // If a window is already open, focus it
      if (clientList.length > 0) {
        const client = clientList[0]
        client.focus()
        return
      }

      // Otherwise open a new window
      self.clients.openWindow('/')
    }),
  )
})
