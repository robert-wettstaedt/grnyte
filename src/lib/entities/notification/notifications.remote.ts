import { notifications } from '$lib/db/schema'
import { authedCommand } from '$lib/remote/authed.server'
import { and, eq, isNull } from 'drizzle-orm'
import z from 'zod'

/**
 * Mark the caller's whole inbox read. Called once when `/notifications` mounts.
 *
 * Deliberately everything rather than the rows currently listed: the list is bounded (the query
 * caps at 50), and per-item read state would mean an inbox whose badge disagrees with what is on
 * screen. Opening the inbox is the act of reading it.
 *
 * Runs on the caller's RLS transaction, where `users can update own notifications` is the gate,
 * so the `auth_user_fk` predicate is the policy's rather than this handler's.
 */
export const markNotificationsRead = authedCommand(z.void(), async (_, { db, user }) => {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userFk, user.id), isNull(notifications.readAt)))
})
