import { createBuilder, syncedQuery, syncedQueryWithContext } from '@rocicorp/zero'
import type { User } from '@supabase/supabase-js'
import z from 'zod'
import { schema } from './zero-schema'

export const builder = createBuilder(schema)

export type QueryContext = User | null | undefined

export const queries = {
  blocksWithLocations: syncedQuery('blocksWithLocations', z.tuple([]), () => {
    return builder.blocks.related('geolocation')
  }),
  areasWithParkingLocations: syncedQuery('areasWithParkingLocations', z.tuple([]), () => {
    return builder.areas.related('parkingLocations')
  }),
  grades: syncedQuery('grades', z.tuple([]), () => {
    return builder.grades
  }),
  tags: syncedQuery('tags', z.tuple([]), () => {
    return builder.tags
  }),
  rolePermissions: syncedQuery('rolePermissions', z.tuple([]), () => {
    return builder.rolePermissions
  }),
  currentUser: syncedQueryWithContext('currentUser', z.tuple([]), (ctx: QueryContext) => {
    return builder.users
      .where('authUserFk', ctx?.id ?? '')
      .related('userSettings')
      .one()
  }),
  currentUserRoles: syncedQueryWithContext('currentUserRoles', z.tuple([]), (ctx: QueryContext) => {
    return builder.userRoles.where('authUserFk', ctx?.id ?? '').one()
  }),
  currentUserRegions: syncedQueryWithContext('currentUserRegions', z.tuple([]), (ctx: QueryContext) => {
    return builder.regionMembers
      .where('authUserFk', ctx?.id ?? '')
      .where('isActive', 'IS NOT', null)
      .related('region')
  }),

  listAreas: syncedQuery(
    'listAreas',
    z.tuple([
      z.object({
        parentFk: z.number().nullish(),
      }),
    ]),
    ({ parentFk }) => {
      return builder.areas.where('parentFk', 'IS', parentFk ?? null).orderBy('name', 'asc')
    },
  ),

  ...(() => {
    const schema = z.object({
      areaId: z.number().nullish(),
      maxGrade: z.number().optional(),
      minGrade: z.number().optional(),
      pageSize: z.number().optional(),
      sort: z.enum(['rating', 'grade', 'firstAscentYear']).optional(),
      sortOrder: z.enum(['asc', 'desc']).optional(),
      userId: z.number().optional().nullish(),
      withRelations: z.boolean().optional(),
    })

    const listRoutes = (opts: z.infer<typeof schema>) => {
      let q = builder.routes

      if (opts.areaId != null) {
        q = q.where('areaIds', 'ILIKE', `%^${opts.areaId}$%`)
      }

      if (opts.minGrade != null) {
        q = q.where('gradeFk', '>=', opts.minGrade)
      }
      if (opts.maxGrade != null) {
        q = q.where('gradeFk', '<=', opts.maxGrade)
      }

      if (opts.sortOrder != null && opts.sort != null) {
        q = q.orderBy(opts.sort === 'grade' ? 'gradeFk' : opts.sort, opts.sortOrder)

        switch (opts.sort) {
          case 'rating':
            q = q.orderBy('gradeFk', 'asc')
            break

          case 'grade':
            q = q.orderBy('rating', 'desc')
            break
        }

        q = q.orderBy('id', 'asc')
      }

      if (opts.pageSize != null) {
        q = q.limit(opts.pageSize)
      }

      return q
    }

    return {
      listRoutes: syncedQuery('listRoutes', z.tuple([schema]), (opts) => {
        return listRoutes(opts)
      }),
      listRoutesWithRelations: syncedQuery('listRoutesWithRelations', z.tuple([schema]), (opts) => {
        return listRoutes(opts)
          .related('ascents', (q) =>
            opts.userId == null ? q.where('createdBy', 'IS', null) : q.where('createdBy', '=', opts.userId),
          )
          .related('block', (q) =>
            q.related('area', (q) =>
              q.related('parent', (q) => q.related('parent', (q) => q.related('parent', (q) => q.related('parent')))),
            ),
          )
      }),
    }
  })(),
}
