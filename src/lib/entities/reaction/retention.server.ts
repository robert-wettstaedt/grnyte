import { pinnedTx } from '$lib/db/pinned.server'
import { deletedComments } from '$lib/db/schema'
import { DAY_MS } from '$lib/i18n/relativeTime'
import { lt } from 'drizzle-orm'

/** How long a deleted comment keeps its words for the Undo, mirrored in terms clause 19. */
export const COMMENT_UNDO_MS = DAY_MS

/** Drops the kept words of comments deleted before `before`, which ends their Undo. */
export const eraseDeletedComments = async (before: Date): Promise<number> => {
  const erased = await pinnedTx((tx) => tx.delete(deletedComments).where(lt(deletedComments.createdAt, before)))
  return erased.count
}
