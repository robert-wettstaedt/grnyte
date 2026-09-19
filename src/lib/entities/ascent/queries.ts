import * as z from '$lib/forms/zod'
import { regionMemberCan, relatedRegion } from '$lib/zero/permissions'
import { zql } from '$lib/zero/zero-schema.gen'
import { defineQuery } from '@rocicorp/zero'

/**
 * The enriched ascent tree behind `toUserAscentDetail`: author, media, and the route's name
 * and community grade with its block and area.
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
