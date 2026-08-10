import { authenticatedUserCan, relatedRegion } from '$lib/zero/permissions'
import { zql } from '$lib/zero/zero-schema.gen'
import { defineQuery } from '@rocicorp/zero'
import z from 'zod'

/** Sync window when a caller doesn't pick one: one screenful of inbox, newest first. */
const DEFAULT_LIMIT = 50

export const notificationsQueryDefs = {
  /**
   * The signed-in user's inbox, newest first.
   *
   * Own rows only, on top of the region gate every list carries: `notifications` sits in
   * `regionTables`, so a row whose region the reader has since left syncs to nobody. RLS
   * re-checks the same thing server-side (`auth.uid() = auth_user_fk`).
   *
   * `actor` is the only relation worth syncing: `entityId` is polymorphic text, so the thing a
   * row is about is hydrated client-side through the per-entity list resources.
   */
  listNotifications: defineQuery(
    z.object({
      limit: z.number().optional(),
      /** The badge's query: what has not been opened yet. */
      unreadOnly: z.boolean().optional(),
    }),
    // `authenticatedUserCan` rather than `regionMemberCan`, which is what every other own-rows
    // query uses: this callback dereferences `ctx.authUserId`, and only that wrapper refuses a
    // missing context instead of reading through it. The region filter is then applied by hand,
    // exactly as `listUsers` does.
    authenticatedUserCan(({ args, ctx }) => {
      let q = zql.notifications
        .where('authUserFk', ctx.authUserId)
        .orderBy('createdAt', 'desc')
        .orderBy('id', 'desc')
        .related('actor')

      if (args.unreadOnly === true) {
        q = q.where('readAt', 'IS', null)
      }

      // Always bounded: an inbox nobody opens grows without limit, and the badge only has to
      // count far enough to say "more than you want to read".
      return relatedRegion(ctx)(q.limit(args.limit ?? DEFAULT_LIMIT))
    }),
  ),
}
