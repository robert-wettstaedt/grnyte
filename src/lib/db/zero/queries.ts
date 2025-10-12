import type { Query } from '@rocicorp/zero'
import { syncedQuery, syncedQueryWithContext } from '@rocicorp/zero'
import type { User } from '@supabase/supabase-js'
import z from 'zod'
import { activityParentEntityType, activityType, ascentTypeEnum } from '../schema'
import { type Schema } from './zero-schema'
import { builder } from './zero-schema.gen'

export type QueryContext = User | null | undefined

export const queries = {
  grades: syncedQuery('grades', z.tuple([]), () => {
    return builder.grades
  }),
  tags: syncedQuery('tags', z.tuple([]), () => {
    return builder.tags
  }),
  regions: syncedQuery('regions', z.tuple([]), () => {
    return builder.regions
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

  listUsers: syncedQuery(
    'listUsers',
    z.tuple([
      z.object({
        content: z.string().optional(),
        id: z.union([z.number(), z.array(z.number())]).optional(),
      }),
    ]),
    ({ content, id }) => {
      let q = builder.users

      if (id != null) {
        if (Array.isArray(id)) {
          q = q.where('id', 'IN', id)
        } else {
          q = q.where('id', id)
        }
      }

      if (content != null) {
        q = q.where('username', 'ILIKE', `%${content}%`)
      }

      return q
    },
  ),

  listAreas: syncedQuery(
    'listAreas',
    z.tuple([
      z.object({
        areaId: z.union([z.number(), z.array(z.number())]).optional(),
        content: z.string().optional(),
        parentFk: z.number().optional().nullish(),
      }),
    ]),
    ({ areaId, content, parentFk }) => {
      let q = builder.areas
        .orderBy('name', 'asc')
        .related('parent', (q) => q.related('parent'))
        .related('parkingLocations')

      if (areaId != null) {
        if (Array.isArray(areaId)) {
          q = q.where('id', 'IN', areaId)
        } else {
          q = q.where('id', areaId)
        }
      }

      if (parentFk !== undefined) {
        q = q.where('parentFk', 'IS', parentFk)
      }

      if (content != null) {
        q = q.where((q) => q.or(q.cmp('name', 'ILIKE', `%${content}%`), q.cmp('description', 'ILIKE', `%${content}%`)))
      }

      return q
    },
  ),
  area: syncedQuery(
    'area',
    z.tuple([
      z.object({
        id: z.number(),
      }),
    ]),
    ({ id }) => {
      return builder.areas
        .where('id', id)
        .related('parent', (q) => q.related('parent', (q) => q.related('parent')))
        .related('author')
        .related('parent')
        .related('files')
        .related('parkingLocations')
        .one()
    },
  ),

  listBlocks: syncedQuery(
    'listBlocks',
    z.tuple([
      z.object({
        areaId: z.number().optional().nullable(),
        blockId: z.union([z.number(), z.array(z.number())]).optional(),
        content: z.string().optional(),
      }),
    ]),
    ({ areaId, blockId, content }) => {
      let q = builder.blocks
        .orderBy('order', 'asc')
        .orderBy('name', 'asc')
        .related('topos', (q) => q.orderBy('id', 'asc').related('file'))
        .related('area', (q) => q.related('parent'))
        .related('geolocation')

      if (blockId != null) {
        if (Array.isArray(blockId)) {
          q = q.where('id', 'IN', blockId)
        } else {
          q = q.where('id', blockId)
        }
      }

      if (areaId !== undefined) {
        q = q.where('areaFk', 'IS', areaId)
      }

      if (content != null) {
        q = q.where('name', 'ILIKE', `%${content}%`)
      }

      return q
    },
  ),
  block: syncedQuery(
    'block',
    z.tuple([
      z.object({
        areaId: z.number().optional(),
        blockSlug: z.string().optional(),
        blockId: z.number().optional(),
      }),
    ]),
    ({ areaId, blockId, blockSlug }) => {
      let q = builder.blocks

      if (areaId != null) {
        q = q.where('areaFk', areaId)
      }

      if (blockSlug != null) {
        q = q.where('slug', blockSlug)
      }

      if (blockId != null) {
        q = q.where('id', blockId)
      }

      return q
        .related('area', (q) => q.related('parent', (q) => q.related('parent', (q) => q.related('parent'))))
        .related('routes')
        .related('topos', (q) => q.related('routes').related('file'))
        .related('geolocation')
        .one()
    },
  ),

  ...(function getListQuery() {
    const schema = z.object({
      areaId: z.number().nullish(),
      content: z.string().optional(),
      maxGrade: z.number().optional(),
      minGrade: z.number().optional(),
      pageSize: z.number().optional(),
      routeId: z.union([z.number(), z.array(z.number())]).optional(),
      sort: z.enum(['rating', 'grade', 'firstAscentYear']).optional(),
      sortOrder: z.enum(['asc', 'desc']).optional(),
      userId: z.number().optional().nullish(),
      withRelations: z.boolean().optional(),
    })

    const listRoutes = (opts: z.infer<typeof schema>) => {
      let q = builder.routes

      if (opts.routeId != null) {
        if (Array.isArray(opts.routeId)) {
          q = q.where('id', 'IN', opts.routeId)
        } else {
          q = q.where('id', opts.routeId)
        }
      }

      if (opts.areaId != null) {
        q = q.where('areaIds', 'ILIKE', `%^${opts.areaId}$%`)
      }

      if (opts.minGrade != null) {
        q = q.where('gradeFk', '>=', opts.minGrade)
      }
      if (opts.maxGrade != null) {
        q = q.where('gradeFk', '<=', opts.maxGrade)
      }

      if (opts.content != null) {
        q = q.where((q) =>
          q.or(q.cmp('name', 'ILIKE', `%${opts.content}%`), q.cmp('description', 'ILIKE', `%${opts.content}%`)),
        )
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
      listRoutesWithExternalResources: syncedQuery('listRoutesWithExternalResources', z.tuple([schema]), (opts) => {
        return listRoutes(opts)
          .related('block')
          .related('externalResources', (q) =>
            q.related('externalResource27crags').related('externalResource8a').related('externalResourceTheCrag'),
          )
      }),
      listRoutesWithAscents: syncedQuery('listRoutesWithAscents', z.tuple([schema]), (opts) => {
        return listRoutes(opts).related('ascents', (q) =>
          opts.userId == null ? q : q.where('createdBy', '=', opts.userId),
        )
      }),
    }
  })(),
  route: syncedQuery(
    'route',
    z.tuple([
      z.object({
        areaId: z.number().optional(),
        blockSlug: z.string().optional(),
        routeSlug: z.string(),
      }),
    ]),
    ({ areaId, blockSlug, routeSlug }) => {
      function getRouteDbFilterRaw(routeSlug: string, q: Query<Schema, 'routes'>): Query<Schema, 'routes'> {
        return Number.isNaN(Number(routeSlug)) ? q.where('slug', routeSlug) : q.where('id', Number(routeSlug))
      }

      let q = builder.blocks

      if (areaId != null) {
        q = q.where('areaFk', areaId)
      }

      if (blockSlug != null) {
        q = q.where('slug', blockSlug)
      }

      return q
        .related('area', (q) => q.related('parent', (q) => q.related('parent', (q) => q.related('parent'))))
        .whereExists('routes', (q) => getRouteDbFilterRaw(routeSlug, q))
        .related('routes', (q) =>
          getRouteDbFilterRaw(routeSlug, q)
            .related('tags')
            .related('firstAscents', (q) => q.related('firstAscensionist', (q) => q.related('user')))
            .related('externalResources', (q) =>
              q.related('externalResource27crags').related('externalResource8a').related('externalResourceTheCrag'),
            ),
        )
        .related('topos')
        .one()
    },
  ),

  listAscents: syncedQuery(
    'listAscents',
    z.tuple([
      z.object({
        ascentId: z.union([z.number(), z.array(z.number())]).optional(),
        createdBy: z.number().optional().nullable(),
        grade: z.number().optional().nullable(),
        notes: z.string().optional(),
        routeId: z.number().optional().nullable(),
        types: z.array(z.enum(ascentTypeEnum)).optional(),
      }),
    ]),
    ({ ascentId, createdBy, grade, notes, routeId, types }) => {
      let q = builder.ascents.related('author').related('route').related('files')

      if (ascentId != null) {
        if (Array.isArray(ascentId)) {
          q = q.where('id', 'IN', ascentId)
        } else {
          q = q.where('id', ascentId)
        }
      }

      if (createdBy != null) {
        q = q.where('createdBy', createdBy)
      }

      if (routeId != null) {
        q = q.where('routeFk', routeId)
      }

      if (grade === null) {
        q = q.where('gradeFk', 'IS NOT', null)
      }

      if (notes != null) {
        q = q.where('notes', 'ILIKE', `%${notes}%`)
      }

      if (types != null) {
        q = q.where('type', 'IN', types)
      }

      return q
    },
  ),
  ascent: syncedQuery(
    'ascent',
    z.tuple([
      z.object({
        id: z.number(),
      }),
    ]),
    ({ id }) => {
      return builder.ascents
        .where('id', id)
        .related('author')
        .related('route', (q) =>
          q.related('block', (q) =>
            q.related('area', (q) => q.related('parent', (q) => q.related('parent', (q) => q.related('parent')))),
          ),
        )
        .one()
    },
  ),

  listFiles: syncedQuery(
    'listFiles',
    z.tuple([
      z.object({
        entity: z
          .object({
            type: z.enum(['area', 'ascent', 'route']),
            id: z.union([z.number(), z.array(z.number())]),
          })
          .optional(),
        fileId: z.union([z.string(), z.array(z.string())]).optional(),
      }),
    ]),
    ({ entity, fileId }) => {
      let q = builder.files.related('area').related('ascent').related('block').related('route')

      if (fileId != null) {
        if (Array.isArray(fileId)) {
          q = q.where('id', 'IN', fileId)
        } else {
          q = q.where('id', fileId)
        }
      }

      if (entity != null) {
        const type = entity.type === 'area' ? 'areaFk' : entity.type === 'ascent' ? 'ascentFk' : 'routeFk'

        if (Array.isArray(entity.id)) {
          q = q.where(type, 'IN', entity.id)
        } else {
          q = q.where(type, entity.id)
        }
      }

      return q
    },
  ),

  firstAscensionists: syncedQuery('firstAscensionists', z.tuple([]), () => {
    return builder.firstAscensionists.orderBy('name', 'asc').related('user')
  }),

  activities: syncedQuery(
    'activities',
    z.tuple([
      z.object({
        entity: z
          .object({
            type: z.enum(activityParentEntityType),
            id: z.string().optional(),
          })
          .optional(),
        pageSize: z.number(),
        type: z.enum(activityType).optional(),
        userFk: z.number().optional(),
      }),
    ]),
    ({ entity, pageSize, type, userFk }) => {
      let q = builder.activities.orderBy('createdAt', 'desc').related('user').limit(pageSize)

      if (entity != null) {
        q = q.where(({ and, or, cmp }) => {
          if (entity.id == null) {
            return or(cmp('entityType', entity.type), cmp('parentEntityType', entity.type))
          }

          return or(
            and(cmp('entityId', entity.id), cmp('entityType', entity.type)),
            and(cmp('parentEntityId', entity.id), cmp('parentEntityType', entity.type)),
          )
        })
      }

      if (type != null) {
        q = q.where('type', type)
      }

      if (userFk != null) {
        q = q.where('userFk', userFk)
      }

      return q
    },
  ),
}
