import { pinnedTx } from '$lib/db/pinned.server'
import { notifications } from '$lib/db/schema'
import { and, count, inArray, isNull, notInArray, sql, type AnyColumn } from 'drizzle-orm'
import { QUEUE_ONLY } from './sourceType'

/** A timestamp column cut to a JS Date's precision, so it compares equal to the value read from it. */
export const toMs = (column: AnyColumn) => sql`date_trunc('milliseconds', ${column})`

/** Unread inbox rows per person, which is what the app badge shows. Counted here so the service
 *  worker can set it from the payload rather than from however many OS notifications survive. */
export async function unreadCounts(userFks: readonly number[]): Promise<Map<number, number>> {
  const ids = [...new Set(userFks)]
  if (ids.length === 0) {
    return new Map()
  }

  const rows = await pinnedTx((tx) =>
    tx
      .select({ total: count(), userFk: notifications.userFk })
      .from(notifications)
      .where(
        and(
          inArray(notifications.userFk, ids),
          isNull(notifications.readAt),
          // Never the queue-only pair. They are unread between being written and being sent, and
          // counting them would put a number on the home-screen icon for a row the inbox cannot show
          // and the reader can therefore never clear. The same exclusion is in the inbox query, so
          // the badge the app draws and the badge the payload carries count the same rows.
          notInArray(notifications.sourceType, [...QUEUE_ONLY]),
        ),
      )
      .groupBy(notifications.userFk),
  )

  return new Map(rows.map((row) => [row.userFk, row.total]))
}
