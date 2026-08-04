import { regionMemberCan, relatedRegion } from '$lib/zero/permissions'
import { zql } from '$lib/zero/zero-schema.gen'
import { defineQuery } from '@rocicorp/zero'
import z from 'zod'

export const blocksQueryDefs = {
  block: defineQuery(
    z.object({
      areaId: z.number().optional(),
      blockId: z.number().optional(),
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
  // The topo photos and their drawn lines for a set of blocks. `listBlocks` carries the
  // photos but not the lines, and every one of its callers (search, area lists) would pay
  // for them; the feed is the only screen that renders a line it did not navigate to.
  //
  // No `tags`: `toTopoViews` reads a route's name and grade and nothing else, and this is
  // the query its input type is derived from, so what it does not read it does not sync.
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
      areaId: z.number().optional().nullable(),
      blockId: z.union([z.number(), z.array(z.number())]).optional(),
      content: z.string().optional(),
      limit: z.number().optional(),
    }),
    regionMemberCan(({ args, ctx }) => {
      const r = relatedRegion(ctx)

      let q = zql.blocks
        .where('deletedAt', 'IS', null)
        .orderBy('order', 'asc')
        .orderBy('name', 'asc')
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
        q = q.where('name', 'ILIKE', `%${args.content}%`)
      }

      if (args.limit != null) {
        q = q.limit(args.limit)
      }

      return q
    }),
  ),
}
