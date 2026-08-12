import { regionMemberCan, relatedRegion } from '$lib/zero/permissions'
import { zql } from '$lib/zero/zero-schema.gen'
import { defineQuery } from '@rocicorp/zero'
import z from 'zod'

/**
 * The enriched ascent tree behind `toUserAscentDetail`: author, media, and the route's name
 * and community grade with its block and area. Shared by the profile's list and the
 * activity feed's id lookup so the two can't drift into different DTO shapes.
 */
const detailedAscents = (ctx: Parameters<typeof relatedRegion>[0]) => {
  const r = relatedRegion(ctx)
  return zql.ascents
    .where('deletedAt', 'IS', null)
    .related('author')
    .related('files', (q) => r(q).related('bunnyStream').related('author'))
    .related('route', (q) => r(q).related('block', (q) => r(q).related('area', r)))
}

export const ascentsQueryDefs = {
  // One ascent with its media, for the edit-ascent form.
  ascent: defineQuery(
    z.object({ ascentId: z.number() }),
    regionMemberCan(({ args, ctx }) => {
      const r = relatedRegion(ctx)
      return zql.ascents
        .where('deletedAt', 'IS', null)
        .where('id', args.ascentId)
        .related('files', (q) => r(q).related('bunnyStream').related('author'))
    }),
  ),

  // Ascents for a set of ids, on the same tree as listUserAscentsDetailed. The activity
  // feed hydrates them this way: `activities.entityId` is polymorphic text, so Zero cannot
  // join an activity row to its ascent and the ids have to be collected and re-queried.
  listAscentsByIds: defineQuery(
    z.object({ ascentId: z.array(z.number()) }),
    regionMemberCan(({ args, ctx }) => detailedAscents(ctx).where('id', 'IN', args.ascentId)),
  ),

  // All ascents of one route, with their media and author: feeds the route detail
  // page's ascent list, grade-opinion chart, and beta videos (ascent files).
  listRouteAscents: defineQuery(
    z.object({ routeId: z.number() }),
    regionMemberCan(({ args, ctx }) => {
      const r = relatedRegion(ctx)
      // bunnyStream/author aren't `r`'s region-scoped tables, but they're reached only
      // through an already region-filtered file (and RLS re-checks them server-side).
      return zql.ascents
        .where('deletedAt', 'IS', null)
        .where('routeFk', args.routeId)
        .related('author')
        .related('files', (q) => r(q).related('bunnyStream').related('author'))
    }),
  ),

  listUserAscents: defineQuery(
    z.object({ userId: z.number() }),
    regionMemberCan(({ args }) => zql.ascents.where('deletedAt', 'IS', null).where('createdBy', args.userId)),
  ),

  // A user's ascents enriched for their profile: author + media (like
  // listRouteAscents) plus the route's name and community grade. Kept separate
  // from the lean listUserAscents so the widely-shared ascent-status query
  // doesn't drag these related trees into everyone's cold-load sync.
  listUserAscentsDetailed: defineQuery(
    z.object({ userId: z.number() }),
    regionMemberCan(({ args, ctx }) => detailedAscents(ctx).where('createdBy', args.userId)),
  ),
}
