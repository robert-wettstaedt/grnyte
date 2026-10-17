import { pinnedTx } from '$lib/db/pinned.server'
import { clientErrorLogs } from '$lib/db/schema'
import { lt } from 'drizzle-orm'
import { ERROR_LOG_MAX_AGE_DAYS } from './failure.server'

/** Error logs, client and server alike. The figure is published, so it lives beside the writer
 *  that owns them. Nothing pruned them before, so the table only ever grew. */
export const ERROR_LOG_MAX_AGE_MS = ERROR_LOG_MAX_AGE_DAYS * 24 * 60 * 60 * 1000

/** Drop error logs past the cutoff. A fault nobody looked at in three months is not one anybody
 *  is going to diagnose, and every row carries a pathname and a user agent. */
export const sweepErrorLogs = async (before: Date): Promise<number> => {
  const removed = await pinnedTx((tx) =>
    tx.delete(clientErrorLogs).where(lt(clientErrorLogs.createdAt, before)).returning({ id: clientErrorLogs.id }),
  )
  return removed.length
}
