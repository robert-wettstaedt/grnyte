import { relatedRouteTree } from '$lib/entities/event/queries'
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
   * The object arrives nested, the way an event's does: a notification names it in the same six
   * typed columns, so the row it draws comes off the relation rather than out of a second pass
   * that fetched every area, block, route and ascent the window mentioned and joined them in
   * memory. That pass, and the skeleton state it needed, are gone.
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
      const r = relatedRegion(ctx)
      const route = relatedRouteTree(ctx)

      let q = zql.notifications
        .where('authUserFk', ctx.authUserId)
        .orderBy('createdAt', 'desc')
        .orderBy('id', 'desc')
        .related('actor')
        .related('area', (q) => r(q).related('parent', r))
        // The ascent's route carries the row (grade, stars, tags, thumb), exactly as on a feed
        // card: reading those off the ascent renders a real route with zeroed values.
        .related('ascent', (q) => r(q).related('author').related('route', route))
        .related('block', (q) =>
          r(q)
            .related('area', r)
            .related('geolocation', r)
            .related('topos', (q) => r(q).related('file', r)),
        )
        .related('route', route)
        // `file` is deliberately not nested: nothing writes `file_fk` on a notification, because a
        // reaction on an upload is about the thing the photos landed on.
        .related('subject')

      if (args.unreadOnly === true) {
        q = q.where('readAt', 'IS', null)
      }

      // Always bounded: an inbox nobody opens grows without limit, and the badge only has to
      // count far enough to say "more than you want to read".
      return relatedRegion(ctx)(q.limit(args.limit ?? DEFAULT_LIMIT))
    }),
  ),
}
