import { pinnedTx } from '$lib/db/pinned.server'
import { notifications } from '$lib/db/schema'
import { and, isNotNull, isNull, lt, or } from 'drizzle-orm'

/** A notification somebody has already opened is history the inbox does not render. */
export const NOTIFICATION_READ_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

/** One they never opened is kept three times as long before it is written off as never read. */
export const NOTIFICATION_UNREAD_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000

/**
 * Drop notifications nobody is going to read again.
 *
 * About bounding what Zero syncs into every replica, not about what is on screen: the inbox
 * query is capped at a page either way. Unread rows get three times the grace, since deleting
 * one is deleting something that was never delivered.
 */
export const sweepNotifications = async (readBefore: Date, unreadBefore: Date): Promise<number> => {
  const removed = await pinnedTx((tx) =>
    tx
      .delete(notifications)
      .where(
        or(
          and(isNotNull(notifications.readAt), lt(notifications.readAt, readBefore)),
          and(isNull(notifications.readAt), lt(notifications.createdAt, unreadBefore)),
        ),
      )
      .returning({ id: notifications.id }),
  )
  return removed.length
}
