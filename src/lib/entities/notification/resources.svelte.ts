import { queries } from '$lib/zero/queries'
import { createResource } from '$lib/zero/resource.svelte'
import { toNotification } from './mapper'

export interface NotificationListFilter {
  /** Sync window. Defaults to the query's 50. */
  limit?: number
  /** Only what has not been opened yet: the badge's window. */
  unreadOnly?: boolean
}

/**
 * How far the badge counts. Past this the number stops being information and starts being a
 * dare, so the bell says "99+" instead of syncing an inbox nobody is going to read.
 */
export const UNREAD_CAP = 99

export function notificationList(filter: () => NotificationListFilter = () => ({})) {
  return createResource(
    () => queries.listNotifications(filter()),
    (rows) => rows.map(toNotification),
  )
}

/** The unread rows, capped. Feeds the bell, the tab dot and the OS badge from one query. */
export function unreadNotificationList() {
  return notificationList(() => ({ limit: UNREAD_CAP + 1, unreadOnly: true }))
}
