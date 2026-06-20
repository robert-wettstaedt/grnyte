import { regionMemberCan, relatedRegion } from '$lib/zero/permissions'
import { zql } from '$lib/zero/zero-schema.gen'
import { defineQuery } from '@rocicorp/zero'
import z from 'zod'

export const blocksQueryDefs = {
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
        .related('topos', (q) => r(q).orderBy('id', 'asc').related('file', r))
        .related('area', (q) => r(q).related('parent', r))
        .related('geolocation', r)

      if (args.blockId != null) {
        if (Array.isArray(args.blockId)) {
          q = q.where('id', 'IN', args.blockId)
        } else {
          q = q.where('id', args.blockId)
        }
      }

      if (args.areaId != null) {
        // Match blocks anywhere beneath the area, not just direct children. Areas
        // carry no denormalized ancestor path, but routes do (`areaIds`), so test
        // for a route in the subtree. Blocks with no routes are omitted — they
        // anchor nothing.
        q = q.whereExists('routes', (q) =>
          r(q).where('deletedAt', 'IS', null).where('areaIds', 'ILIKE', `%^${args.areaId}$%`),
        )
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
        .related('routes', (q) => r(q).where('deletedAt', 'IS', null))
        .related('topos', (q) => r(q).related('routes', r).related('file', r))
        .related('geolocation', r)
        .one()
    }),
  ),
}
