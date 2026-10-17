import type { RegionMembership } from '$lib/entities/region/dto'
import { queries } from '$lib/zero/queries'
import { createResource } from '$lib/zero/resource.svelte'
import { toNotification } from './mapper'

/**
 * How far the badge counts. Past this the number stops being information and starts being a
 * dare, so the bell says "99+" instead of syncing an inbox nobody is going to read.
 */
export const UNREAD_CAP = 99

/** The inbox. `userRegions` feeds each row's region crumb. */
export function notificationList(userRegions: () => RegionMembership[]) {
  return createResource(
    () => queries.listNotifications({}),
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
