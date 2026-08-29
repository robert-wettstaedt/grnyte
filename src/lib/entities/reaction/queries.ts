import * as z from '$lib/forms/zod'
import { regionMemberCan, relatedRegion } from '$lib/zero/permissions'
import { zql } from '$lib/zero/zero-schema.gen'
import { defineQuery } from '@rocicorp/zero'

/**
 * How much of a thread arrives when it is opened. Newest first, so a long thread is truncated at
 * the end nobody scrolls to; `commentList` grows this the way the feed grows its window.
 */
const DEFAULT_LIMIT = 30

export const reactionsQueryDefs = {
  /**
   * One event's thread, fetched only when somebody opens it.
   *
   * Comments are deliberately NOT part of `listEvents`' relation tree: a body is up to 5000
   * characters and the feed syncs a window of 50 events twice over, so keeping them there would
   * land the text of every conversation in the region on every reader's device just to render a
   * number. That number comes off `events.comment_count`; this query is what the sheet opens.
   *
   * Ordered newest first and reversed for display, rather than ordered as it reads. A thread is
   * read oldest to newest, but it is TRUNCATED at the old end, and `limit` on an ascending order
   * would cut off the newest instead, which is the half somebody opening a thread came for.
   *
   * Replies arrive nested under the comment they answer, so one level of thread is one query. They
   * carry no limit of their own: one level deep, a reply count that would need paging is a thread
   * that wanted its own screen.
   *
   * `children` is BOTH kinds, split by `type` in the mapper: a comment's answers and the emoji sent
   * on it hang off the same column, and Zero attaches a relation once per name, so asking twice
   * under two filters is not available without renaming one of them in `schema.ts`. The second
   * level of `children` is what a reply's own emoji arrive through.
   */
  listComments: defineQuery(
    z.object({
      eventId: z.number(),
      /** Sync window. Defaults to 30; bump it to reach further back. */
      limit: z.optional(z.number()),
    }),
    regionMemberCan(({ args, ctx }) => {
      // The same region check the top level gets, on every level below it, as every other related
      // sub-query in the repo does: `regionMemberCan` filters what this query SELECTS, and a
      // relation is a second select. A row whose `region_fk` ever diverged from its parent's would
      // otherwise ride into a reader's replica on the back of a comment they are allowed to see.
      const r = relatedRegion(ctx)

      return (
        zql.reactions
          .where('eventFk', args.eventId)
          .where('type', 'comment')
          .where('parentFk', 'IS', null)
          .where('deletedAt', 'IS', null)
          .related('user')
          .related('children', (q) =>
            r(q)
              .where('deletedAt', 'IS', null)
              .related('user')
              .related('children', (q) => r(q).where('deletedAt', 'IS', null).related('user'))
              .orderBy('createdAt', 'asc')
              .orderBy('id', 'asc'),
          )
          // The id breaks the tie, so two comments written inside one millisecond keep the order
          // they were written in rather than an arbitrary one that can change between syncs.
          .orderBy('createdAt', 'desc')
          .orderBy('id', 'desc')
          .limit(args.limit ?? DEFAULT_LIMIT)
      )
    }),
  ),
}
