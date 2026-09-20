import type { RegionMembership } from '$lib/entities/region/dto'
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

/**
 * `userRegions` is a parameter rather than a read of the global state, unlike `eventList`.
 *
 * The badge's resource is built by `setGlobalState` itself, before it publishes the context, so a
 * `getGlobalState()` in this body is a cycle: it threw on every authenticated page and took the
 * whole shell down with it. Only the crumb on an entity row wants the regions, and the badge draws
 * no rows, so it passes none and the inbox passes its own.
 */
export function notificationList(
  filter: () => NotificationListFilter = () => ({}),
  userRegions: () => RegionMembership[] = () => [],
) {
  return createResource(
    () => queries.listNotifications(filter()),
    (rows) => rows.map((row) => toNotification(row, userRegions())),
  )
}

/**
 * The unread count, capped. Feeds the bell, the tab dot and the OS badge from one query.
 *
 * Its own relation-free query: every consumer reads `.data.length` and nothing else, and the inbox
 * query drags ten related trees (the whole route tree, block to topos to file) that a number cannot
 * use. Those rows are charged to this client group whether or not anything renders them.
 */
export function unreadNotificationList() {
  return createResource(
    () => queries.countUnreadNotifications({ limit: UNREAD_CAP + 1 }),
    (rows) => rows,
  )
}
