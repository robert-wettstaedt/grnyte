import type { Query, ReadonlyJSONValue, QueryFn } from '@rocicorp/zero'
import { syncedQuery, syncedQueryWithContext } from '@rocicorp/zero'
import type { User } from '@supabase/supabase-js'
import z from 'zod'
import { activityParentEntityType, activityType, ascentTypeEnum } from '../schema'
import { type Schema } from './zero-schema'
import { builder } from './zero-schema.gen'

type RegionQuery = Query<
  Schema,
  | 'activities'
  | 'areas'
  | 'ascents'
  | 'blocks'
  | 'bunnyStreams'
  | 'files'
  | 'firstAscensionists'
  | 'geolocations'
  | 'regionInvitations'
  | 'routeExternalResource27crags'
  | 'routeExternalResource8a'
  | 'routeExternalResources'
  | 'routeExternalResourceTheCrag'
  | 'routes'
  | 'routesToFirstAscensionists'
  | 'routesToTags'
  | 'topoRoutes'
  | 'topos',
  any
>

export type QueryContext = {
  user: User | null | undefined
  pageState?: Partial<App.SafeSession>
}

const authenticatedUserCan =
  <TContext extends QueryContext, TArg extends ReadonlyJSONValue[], TReturnQuery extends Query<any, any, any>>(
    cb: QueryFn<Omit<QueryContext, 'user'> & { user: User }, true, TArg, TReturnQuery>,
  ) =>
  (ctx: TContext | null | undefined, ...args: TArg) => {
    if (ctx?.user == null) {
      throw new Error('Not allowed')
    }

    return cb({ ...ctx, user: ctx.user }, ...args)
  }

const regionMemberCan =
  <
    TContext extends QueryContext | null | undefined,
    TArg extends ReadonlyJSONValue[],
    TReturnQuery extends RegionQuery,
  >(
    cb: QueryFn<TContext, true, TArg, TReturnQuery>,
  ) =>
  (ctx: TContext, ...args: TArg) => {
    let q = cb(ctx, ...args)

    if (ctx?.pageState?.userRegions != null) {
      q = q.where(
        'regionFk',
        'IN',
        ctx.pageState.userRegions.map((region) => region.regionFk),
      ) as TReturnQuery
    }

    return q
  }

export const queries = {
  grades: syncedQueryWithContext(
    'grades',
    z.tuple([]),
    authenticatedUserCan(() => {
      return builder.grades
    }),
  ),
  tags: syncedQueryWithContext(
    'tags',
    z.tuple([]),
    authenticatedUserCan(() => {
      return builder.tags
    }),
  ),
  regions: syncedQueryWithContext(
    'regions',
    z.tuple([]),
    authenticatedUserCan(() => {
      return builder.regions
    }),
  ),
  rolePermissions: syncedQueryWithContext(
    'rolePermissions',
    z.tuple([]),
    authenticatedUserCan(() => {
      return builder.rolePermissions
    }),
  ),

  currentUser: syncedQueryWithContext(
    'currentUser',
    z.tuple([]),
    authenticatedUserCan(({ user }) => {
      return builder.users.where('authUserFk', user.id).related('userSettings').one()
    }),
  ),
  currentUserRoles: syncedQueryWithContext(
    'currentUserRoles',
    z.tuple([]),
    authenticatedUserCan(({ user }) => {
      return builder.userRoles.where('authUserFk', user.id).one()
    }),
  ),
  currentUserRegions: syncedQueryWithContext(
    'currentUserRegions',
    z.tuple([]),
    authenticatedUserCan(({ user }) => {
      return builder.regionMembers.where('authUserFk', user.id).where('isActive', 'IS NOT', null).related('region')
    }),
  ),

  listUsers: syncedQueryWithContext(
    'listUsers',
    z.tuple([
      z.object({
        content: z.string().optional(),
        id: z.union([z.number(), z.array(z.number())]).optional(),
      }),
    ]),
    (_, { content, id }) => {
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

  listAreas: syncedQueryWithContext(
    'listAreas',
    z.tuple([
      z.object({
        areaId: z.union([z.number(), z.array(z.number())]).optional(),
        content: z.string().optional(),
        parentFk: z.number().optional().nullish(),
      }),
    ]),
    regionMemberCan((_, { areaId, content, parentFk }) => {
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
    }),
  ),
  area: syncedQueryWithContext(
    'area',
    z.tuple([
      z.object({
        id: z.number(),
      }),
    ]),
    regionMemberCan((_, { id }) => {
      return builder.areas
        .where('id', id)
        .related('parent', (q) => q.related('parent', (q) => q.related('parent')))
        .related('author')
        .related('parent')
        .related('files')
        .related('parkingLocations')
        .one()
    }),
  ),

  listBlocks: syncedQueryWithContext(
    'listBlocks',
    z.tuple([
      z.object({
        areaId: z.number().optional().nullable(),
        blockId: z.union([z.number(), z.array(z.number())]).optional(),
        content: z.string().optional(),
      }),
    ]),
    regionMemberCan((_, { areaId, blockId, content }) => {
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
    }),
  ),
  block: syncedQueryWithContext(
    'block',
    z.tuple([
      z.object({
        areaId: z.number().optional(),
        blockSlug: z.string().optional(),
        blockId: z.number().optional(),
      }),
    ]),
    regionMemberCan((_, { areaId, blockId, blockSlug }) => {
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
    }),
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
      listRoutes: syncedQueryWithContext(
        'listRoutes',
        z.tuple([schema]),
        regionMemberCan((_, opts) => {
          return listRoutes(opts)
        }),
      ),
      listRoutesWithRelations: syncedQueryWithContext(
        'listRoutesWithRelations',
        z.tuple([schema]),
        regionMemberCan((_, opts) => {
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
      ),
      listRoutesWithExternalResources: syncedQueryWithContext(
        'listRoutesWithExternalResources',
        z.tuple([schema]),
        regionMemberCan((_, opts) => {
          return listRoutes(opts)
            .related('block')
            .related('externalResources', (q) =>
              q.related('externalResource27crags').related('externalResource8a').related('externalResourceTheCrag'),
            )
        }),
      ),
      listRoutesWithAscents: syncedQueryWithContext(
        'listRoutesWithAscents',
        z.tuple([schema]),
        regionMemberCan((_, opts) => {
          return listRoutes(opts).related('ascents', (q) =>
            opts.userId == null ? q : q.where('createdBy', '=', opts.userId),
          )
        }),
      ),
    }
  })(),
  route: syncedQueryWithContext(
    'route',
    z.tuple([
      z.object({
        areaId: z.number().optional(),
        blockSlug: z.string().optional(),
        routeSlug: z.string(),
      }),
    ]),
    regionMemberCan((_, { areaId, blockSlug, routeSlug }) => {
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
    }),
  ),

  listAscents: syncedQueryWithContext(
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
    regionMemberCan((_, { ascentId, createdBy, grade, notes, routeId, types }) => {
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
    }),
  ),
  ascent: syncedQueryWithContext(
    'ascent',
    z.tuple([
      z.object({
        id: z.number(),
      }),
    ]),
    regionMemberCan((_, { id }) => {
      return builder.ascents
        .where('id', id)
        .related('author')
        .related('route', (q) =>
          q.related('block', (q) =>
            q.related('area', (q) => q.related('parent', (q) => q.related('parent', (q) => q.related('parent')))),
          ),
        )
        .one()
    }),
  ),

  listFiles: syncedQueryWithContext(
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
    regionMemberCan((_, { entity, fileId }) => {
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
    }),
  ),

  firstAscensionists: syncedQueryWithContext(
    'firstAscensionists',
    z.tuple([]),
    regionMemberCan(() => {
      return builder.firstAscensionists.orderBy('name', 'asc').related('user')
    }),
  ),

  activities: syncedQueryWithContext(
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
    regionMemberCan((_, { entity, pageSize, type, userFk }) => {
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
    }),
  ),
}
