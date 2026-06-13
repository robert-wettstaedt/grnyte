import { regionMemberCan, relatedRegion } from '$lib/zero/permissions'
import { zql } from '$lib/zero/zero-schema.gen'
import { defineQuery } from '@rocicorp/zero'
import z from 'zod'

export const routesQueryDefs = {
  listRoutes: defineQuery(
    z.object({
      areaId: z.number().nullish(),
      content: z.string().optional(),
      firstAscensionists: z.array(z.number()).optional(),
      hasBeta: z.boolean().optional(),
      hasTopo: z.boolean().optional(),
      maxGrade: z.number().optional(),
      minGrade: z.number().optional(),
      minRating: z.number().optional(),
      pageSize: z.number().optional(),
      routeId: z.union([z.number(), z.array(z.number())]).optional(),
      sort: z.enum(['rating', 'grade', 'firstAscentYear']).optional(),
      sortOrder: z.enum(['asc', 'desc']).optional(),
      tags: z.array(z.string()).optional(),
      userId: z.number().optional().nullish(),
      withRelations: z.boolean().optional(),
    }),
    regionMemberCan(({ args, ctx }) => {
      const r = relatedRegion(ctx)

      let q = zql.routes.related('tags', r).related('firstAscents', r)

      if (args.routeId != null) {
        if (Array.isArray(args.routeId)) {
          q = q.where('id', 'IN', args.routeId)
        } else {
          q = q.where('id', args.routeId)
        }
      }

      if (args.areaId != null) {
        q = q.where('areaIds', 'ILIKE', `%^${args.areaId}$%`)
      }

      if (args.minGrade != null) {
        q = q.where('gradeFk', '>=', args.minGrade)
      }
      if (args.maxGrade != null) {
        q = q.where('gradeFk', '<=', args.maxGrade)
      }

      if (args.minRating != null) {
        q = q.where('rating', '>=', args.minRating)
      }

      if (args.tags != null && args.tags.length > 0) {
        q = q.whereExists('tags', (q) => r(q).where('tagFk', 'IN', args.tags!))
      }

      if (args.firstAscensionists != null && args.firstAscensionists.length > 0) {
        q = q.whereExists('firstAscents', (q) => r(q).where('firstAscensionistFk', 'IN', args.firstAscensionists!))
      }

      if (args.hasTopo) {
        q = q.whereExists('topoRoutes', r)
      }

      if (args.hasBeta) {
        q = q.where(({ or, exists }) =>
          or(
            exists('files', (f) => r(f).where('bunnyStreamFk', 'IS NOT', null)),
            exists('ascents', (a) => r(a).whereExists('files', (f) => r(f).where('bunnyStreamFk', 'IS NOT', null))),
          ),
        )
      }

      if (args.content != null) {
        q = q.where((q) =>
          q.or(q.cmp('name', 'ILIKE', `%${args.content}%`), q.cmp('description', 'ILIKE', `%${args.content}%`)),
        )
      }

      if (args.sortOrder != null && args.sort != null) {
        q = q.orderBy(args.sort === 'grade' ? 'gradeFk' : args.sort, args.sortOrder)

        switch (args.sort) {
          case 'rating':
            q = q.orderBy('gradeFk', 'asc')
            break

          case 'grade':
            q = q.orderBy('rating', 'desc')
            break
        }

        q = q.orderBy('id', 'asc')
      }

      if (args.pageSize != null) {
        q = q.limit(args.pageSize)
      }

      return q
    }),
  ),
}
