import { regionMemberCan, relatedRegion } from '$lib/zero/permissions'
import { zql } from '$lib/zero/zero-schema.gen'
import { defineQuery } from '@rocicorp/zero'
import z from 'zod'

export const ascentsQueryDefs = {
  // All ascents of one route, with their media: feeds the route detail page's
  // grade-opinion chart (ascents.gradeFk) and its beta videos (ascent files).
  listRouteAscents: defineQuery(
    z.object({ routeId: z.number() }),
    regionMemberCan(({ args, ctx }) => {
      const r = relatedRegion(ctx)
      return zql.ascents.where('routeFk', args.routeId).related('files', r)
    }),
  ),

  listUserAscents: defineQuery(
    z.object({ userId: z.number() }),
    regionMemberCan(({ args }) => zql.ascents.where('createdBy', args.userId)),
  ),
}
