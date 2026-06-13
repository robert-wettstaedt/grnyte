import { regionMemberCan, relatedRegion } from '$lib/zero/permissions'
import { zql } from '$lib/zero/zero-schema.gen'
import { defineQuery } from '@rocicorp/zero'
import z from 'zod'

export const areasQueryDefs = {
  listAreas: defineQuery(
    z.object({
      id: z.union([z.number(), z.array(z.number())]).optional(),
      parentFk: z.number().optional(),
    }),
    regionMemberCan(({ args, ctx }) => {
      const r = relatedRegion(ctx)

      let q = zql.areas
        .orderBy('name', 'asc')
        .related('parent', (q) => r(q).related('parent', r))
        .related('parkingLocations', r)

      if (args.id != null) {
        q = Array.isArray(args.id) ? q.where('id', 'IN', args.id) : q.where('id', args.id)
      }

      if (args.parentFk != null) {
        q = q.where('parentFk', 'IS', args.parentFk)
      }

      return q
    }),
  ),
  area: defineQuery(
    z.object({
      id: z.number(),
    }),
    regionMemberCan(({ args, ctx }) => {
      const r = relatedRegion(ctx)

      return zql.areas
        .where('id', args.id)
        .related('parent', (q) => r(q).related('parent', (q) => r(q).related('parent', r)))
        .related('author')
        .related('files', r)
        .related('parkingLocations', r)
        .one()
    }),
  ),
}
