import { pinnedTx } from '$lib/db/pinned.server'
import { feedback } from '$lib/db/schema'
import { DAY_MS } from '$lib/i18n/relativeTime'
import { and, isNotNull, isNull, lt, or } from 'drizzle-orm'

/** Feedback. 12 months, mirrored in the privacy notice, section 7: change both together. */
export const FEEDBACK_MAX_AGE_MS = 365 * DAY_MS

/**
 * Drop feedback past its retention: from the reply where the row has one, from arrival where it does not.
 * Hard delete, not anonymisation, since the privacy notice promises message and reply both go and clear the
 * backups within 30 days (section 7).
 */
export const sweepFeedback = async (before: Date): Promise<number> => {
  const removed = await pinnedTx((tx) =>
    tx
      .delete(feedback)
      .where(
        or(
          and(isNotNull(feedback.repliedAt), lt(feedback.repliedAt, before)),
          and(isNull(feedback.repliedAt), lt(feedback.createdAt, before)),
        ),
      ),
  )
  return removed.count
}
