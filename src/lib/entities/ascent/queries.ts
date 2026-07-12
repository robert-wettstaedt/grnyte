import { regionMemberCan, relatedRegion } from '$lib/zero/permissions'
import { zql } from '$lib/zero/zero-schema.gen'
import { defineQuery } from '@rocicorp/zero'
import z from 'zod'

export const ascentsQueryDefs = {
  // One ascent with its media, for the edit-ascent form.
  ascent: defineQuery(
    z.object({ ascentId: z.number() }),
    regionMemberCan(({ args, ctx }) => {
      const r = relatedRegion(ctx)
      return zql.ascents
        .where('id', args.ascentId)
        .related('files', (q) => r(q).related('bunnyStream').related('author'))
    }),
  ),

  // All ascents of one route, with their media: feeds the route detail page's
  // grade-opinion chart (ascents.gradeFk) and its beta videos (ascent files).
  listRouteAscents: defineQuery(
    z.object({ routeId: z.number() }),
    regionMemberCan(({ args, ctx }) => {
      const r = relatedRegion(ctx)
      // bunnyStream/author aren't `r`'s region-scoped tables, but they're reached only
      // through an already region-filtered file (and RLS re-checks them server-side).
      return zql.ascents
        .where('routeFk', args.routeId)
        .related('files', (q) => r(q).related('bunnyStream').related('author'))
    }),
  ),

  listUserAscents: defineQuery(
    z.object({ userId: z.number() }),
    regionMemberCan(({ args }) => zql.ascents.where('createdBy', args.userId)),
  ),
}
