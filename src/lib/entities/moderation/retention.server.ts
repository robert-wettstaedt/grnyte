import { pinnedTx } from '$lib/db/pinned.server'
import { moderationDecisions } from '$lib/db/schema'
import { DAY_MS } from '$lib/i18n/relativeTime'
import { lt } from 'drizzle-orm'

/** Moderation decisions. Three years, so an appeal can still be answered; subjects and notices cascade. */
export const DECISION_MAX_AGE_MS = 3 * 365 * DAY_MS

export const sweepDecisions = async (before: Date): Promise<number> => {
  const removed = await pinnedTx((tx) =>
    tx.delete(moderationDecisions).where(lt(moderationDecisions.createdAt, before)),
  )
  return removed.count
}
