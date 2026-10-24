import { relatedFileTree, relatedRouteTree } from '$lib/entities/event/queries'
import * as z from '$lib/forms/zod'
import { authenticatedUserCan, relatedRegion, type QueryContext } from '$lib/zero/permissions'
import { zql } from '$lib/zero/zero-schema.gen'
import { defineQuery } from '@rocicorp/zero'
import { OUTLIVES_MEMBERSHIP, QUEUE_ONLY } from './sourceType'

/** Sync window when a caller doesn't pick one: one screenful of inbox, newest first. */
const DEFAULT_LIMIT = 50

/** `relatedRegion` for the inbox row itself, except a removal notice also passes from a region the
 *  reader left, as its RLS policy lets it (`outlivesMembership`). */
function inboxRegion<Q extends ReturnType<typeof zql.notifications.where>>(ctx: QueryContext, q: Q): Q {
  const regions = ctx.pageState?.userRegions
  if (regions == null) return q
  return q.where(({ cmp, or }) =>
    or(
      cmp(
        'regionFk',
        'IN',
        regions.map((region) => region.regionFk),
      ),
      cmp('sourceType', 'IN', [...OUTLIVES_MEMBERSHIP]),
    ),
  ) as Q
}

export const notificationsQueryDefs = {
  /**
   * The same unread rows with no related trees, because the badge only counts them.
   *
   * A separate definition rather than a flag on `listNotifications`, which is what `listRoutesForMap`
   * did for the same reason: one query cannot return two row shapes without a union type at every
   * call site. The inbox keeps the fat query.
   */
  countUnreadNotifications: defineQuery(
    z.object({ limit: z.optional(z.number()) }),
    authenticatedUserCan(({ args, ctx }) =>
      inboxRegion(
        ctx,
        zql.notifications
          .where('authUserFk', ctx.authUserId)
          .where('sourceType', 'NOT IN', QUEUE_ONLY)
          .where('readAt', 'IS', null)
          .orderBy('createdAt', 'desc')
          .orderBy('id', 'desc')
          .limit(args.limit ?? DEFAULT_LIMIT),
      ),
    ),
  ),

  /**
   * The signed-in user's inbox, newest first.
   *
   * Own rows only, on top of the region gate every list carries: `notifications` sits in
   * `regionTables`, so a row whose region the reader has since left syncs to nobody, except a
   * removal notice (`inboxRegion`). RLS re-checks the same thing server-side.
   *
   * The object arrives nested, the way an event's does: a notification names it in the same six
   * typed columns, so the row it draws comes off the relation rather than out of a second pass
   * that fetched every area, block, route and ascent the window mentioned and joined them in
   * memory. That pass, and the skeleton state it needed, are gone.
   */
  listNotifications: defineQuery(
    // Empty, not removed: an already-loaded tab still calls this query, and stray keys are stripped.
    z.object({}),
    // `authenticatedUserCan` rather than `regionMemberCan`, which is what every other own-rows
    // query uses: this callback dereferences `ctx.authUserId`, and only that wrapper refuses a
    // missing context instead of reading through it. The region filter is then applied by hand,
    // exactly as `listUsers` does.
    authenticatedUserCan(({ ctx }) => {
      const r = relatedRegion(ctx)
      const route = relatedRouteTree(ctx)

      const q = zql.notifications
        .where('authUserFk', ctx.authUserId)
        // This exclusion, not the region gate, is what keeps the send-queue rows out of the inbox:
        // an invitee who accepts, or a removed member invited back, passes that gate afterwards.
        .where('sourceType', 'NOT IN', QUEUE_ONLY)
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
        // `video_ready` is the only source type that writes `file_fk`, so these only materialise on
        // those rows. The parent trees come too: a file has no page and no name, so its row IS the
        // row of whatever it landed on, and `toEventEntity` reads that off these.
        .related('file', relatedFileTree(ctx))
        .related('subject')

      // Always bounded: an inbox nobody opens grows without limit.
      return inboxRegion(ctx, q.limit(DEFAULT_LIMIT))
    }),
  ),
}
