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
    }),
    regionMemberCan(({ args, ctx }) => {
      const r = relatedRegion(ctx)

      let q = zql.blocks
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

      if (args.areaId !== undefined) {
        q = q.where('areaFk', 'IS', args.areaId)
      }

      if (args.content != null) {
        q = q.where('name', 'ILIKE', `%${args.content}%`)
      }

      return q
    }),
  ),
  block: defineQuery(
    z.object({
      areaId: z.number().optional(),
      blockSlug: z.string().optional(),
      blockId: z.number().optional(),
    }),
    regionMemberCan(({ args, ctx }) => {
      const r = relatedRegion(ctx)

      let q = zql.blocks

      if (args.areaId != null) {
        q = q.where('areaFk', args.areaId)
      }

      if (args.blockSlug != null) {
        q = q.where('slug', args.blockSlug)
      }

      if (args.blockId != null) {
        q = q.where('id', args.blockId)
      }

      return q
        .related('area', (q) => r(q).related('parent', (q) => r(q).related('parent', (q) => r(q).related('parent', r))))
        .related('routes', r)
        .related('topos', (q) => r(q).related('routes', r).related('file', r))
        .related('geolocation', r)
        .one()
    }),
  ),
}
