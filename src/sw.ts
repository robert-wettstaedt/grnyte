/// <reference lib="WebWorker" />
/// <reference types="vite/client" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />

import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { NotificationDataSchema, NotificationSchema } from './lib/notifications'

declare let self: ServiceWorkerGlobalScope

self.addEventListener('message', (event) => {
  console.log('message', event)

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
    const newNotification = NotificationSchema.parse(data)

    const options: NotificationOptions = {
      badge: '/android-chrome-192x192.png',
      body: newNotification.body,
      data: newNotification.data,
      icon: newNotification.icon ?? '/android-chrome-192x192.png',
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
        } catch (error) {}
      }

      return self.registration.showNotification(newNotification.title ?? 'New activity', options)
    }

    event.waitUntil(mergeNotifications())
  } catch (error) {
    console.error('Error showing notification:', error)
  }
})

// Handle notification clicks
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
