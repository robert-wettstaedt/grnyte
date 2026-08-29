import * as z from '$lib/forms/zod'
import { regionMemberCan, relatedRegion } from '$lib/zero/permissions'
import { zql } from '$lib/zero/zero-schema.gen'
import { defineQuery } from '@rocicorp/zero'

export const blocksQueryDefs = {
  block: defineQuery(
    z.object({
      areaId: z.optional(z.number()),
      blockId: z.optional(z.number()),
    }),
    regionMemberCan(({ args, ctx }) => {
      const r = relatedRegion(ctx)

      let q = zql.blocks.where('deletedAt', 'IS', null)

      if (args.areaId != null) {
        q = q.where('areaFk', args.areaId)
      }

      if (args.blockId != null) {
        q = q.where('id', args.blockId)
      }

      return q
        .related('area', (q) => r(q).related('parent', (q) => r(q).related('parent', (q) => r(q).related('parent', r))))
        .related('routes', (q) => r(q).where('deletedAt', 'IS', null).related('tags', r))
        .related('topos', (q) =>
          r(q).orderBy('order', 'asc').orderBy('id', 'asc').related('routes', r).related('file', r),
        )
        .related('geolocation', r)
        .one()
    }),
  ),
  // The topo photos and their drawn lines for a set of blocks. `listBlocks` carries the photos but
  // not the lines, since every one of its callers (search, area lists) would pay for them; the feed
  // is the only screen that renders a line it didn't navigate to. No `tags`: `toTopoViews` reads
  // only a route's name and grade, and this query is what its input type is derived from.
  blockTopos: defineQuery(
    z.object({ blockId: z.array(z.number()) }),
    regionMemberCan(({ args, ctx }) => {
      const r = relatedRegion(ctx)

      return zql.blocks
        .where('deletedAt', 'IS', null)
        .where('id', 'IN', args.blockId)
        .related('routes', (q) => r(q).where('deletedAt', 'IS', null))
        .related('topos', (q) =>
          r(q).orderBy('order', 'asc').orderBy('id', 'asc').related('routes', r).related('file', r),
        )
    }),
  ),
  listBlocks: defineQuery(
    z.object({
      areaId: z.nullish(z.number()),
      blockId: z.optional(z.union([z.number(), z.array(z.number())])),
      content: z.optional(z.string()),
      limit: z.optional(z.number()),
      references: z.optional(z.string()),
      /** `createdAt` sorts newest first (the search flyout's "recently added"); default is the block order. */
      sort: z.optional(z.enum(['createdAt', 'order'])),
    }),
    regionMemberCan(({ args, ctx }) => {
      const r = relatedRegion(ctx)

      const base = zql.blocks.where('deletedAt', 'IS', null)

      let q = (
        args.sort === 'createdAt'
          ? base.orderBy('createdAt', 'desc')
          : base.orderBy('order', 'asc').orderBy('name', 'asc')
      )
        .related('topos', (q) => r(q).orderBy('order', 'asc').orderBy('id', 'asc').related('file', r))
        .related('area', (q) => r(q).related('parent', r))
        .related('geolocation', r)

      if (args.blockId != null) {
        if (Array.isArray(args.blockId)) {
          q = q.where('id', 'IN', args.blockId)
        } else {
          q = q.where('id', args.blockId)
        }
      }

      if (args.areaId !== undefined) {
        q = q.where('areaFk', 'IS', args.areaId)
      }

      if (args.content != null) {
        q = q.where((q) =>
          q.or(q.cmp('name', 'ILIKE', `%${args.content}%`), q.cmp('description', 'ILIKE', `%${args.content}%`)),
        )
      }

      // Find blocks whose description contains a reference token (e.g. `!routes:42!`), the
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
