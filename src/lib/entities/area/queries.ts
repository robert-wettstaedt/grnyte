import { regionMemberCan, relatedRegion } from '$lib/zero/permissions'
import { zql } from '$lib/zero/zero-schema.gen'
import { defineQuery } from '@rocicorp/zero'
import z from 'zod'

export const areasQueryDefs = {
  area: defineQuery(
    z.object({
      id: z.number(),
    }),
    regionMemberCan(({ args, ctx }) => {
      const r = relatedRegion(ctx)

      return zql.areas
        .where('id', args.id)
        .where('deletedAt', 'IS', null)
        .related('parent', (q) => r(q).related('parent', (q) => r(q).related('parent', r)))
        .related('author')
        .related('files', r)
        .related('parkingLocations', r)
        .one()
    }),
  ),
  listAreas: defineQuery(
    z.object({
      content: z.string().optional(),
      id: z.union([z.number(), z.array(z.number())]).optional(),
      limit: z.number().optional(),
      parentFk: z.number().nullable().optional(),
      references: z.string().optional(),
      /** `createdAt` sorts newest first (the search flyout's "recently added"); default is by name. */
      sort: z.enum(['createdAt', 'name']).optional(),
    }),
    regionMemberCan(({ args, ctx }) => {
      const r = relatedRegion(ctx)

      const base = zql.areas.where('deletedAt', 'IS', null)

      let q = (args.sort === 'createdAt' ? base.orderBy('createdAt', 'desc') : base.orderBy('name', 'asc'))
        .related('parent', (q) => r(q).related('parent', r))
        .related('parkingLocations', r)

      if (args.id != null) {
        q = Array.isArray(args.id) ? q.where('id', 'IN', args.id) : q.where('id', args.id)
      }

      // Explicit `null` filters to top-level areas (parentFk IS NULL); omitting it
      // means no parent filter at all.
      if (args.parentFk !== undefined) {
        q = q.where('parentFk', 'IS', args.parentFk)
      }

      if (args.content != null) {
        q = q.where((q) =>
          q.or(q.cmp('name', 'ILIKE', `%${args.content}%`), q.cmp('description', 'ILIKE', `%${args.content}%`)),
        )
      }

      // Find areas whose description contains a reference token (e.g. `!blocks:42!`) — the
      // backlinks for the referenced entity. The token's delimiters keep it exact.
      if (args.references != null) {
        q = q.where('description', 'ILIKE', `%${args.references}%`)
      }

      if (args.limit != null) {
        q = q.limit(args.limit)
      }

      return q
    }),
  ),
}
