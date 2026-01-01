import type { PullRow, Query, ReadonlyJSONValue } from '@rocicorp/zero'
import { defineQueries, defineQuery } from '@rocicorp/zero'
import z from 'zod'
import { activityParentEntityType, activityType, ascentTypeEnum, favoriteEntityType } from '../schema'
import type { Schema } from './zero-schema'
import { zql } from './zero-schema.gen'

type RegionPreloadTable =
  | 'areas'
  | 'ascents'
  | 'blocks'
  | 'files'
  | 'firstAscensionists'
  | 'geolocations'
  | 'routeExternalResource27crags'
  | 'routeExternalResource8a'
  | 'routeExternalResources'
  | 'routeExternalResourceTheCrag'
  | 'routes'
  | 'routesToFirstAscensionists'
  | 'routesToTags'
  | 'topoRoutes'
  | 'topos'

const regionPreloadTables: RegionPreloadTable[] = [
  'areas',
  'ascents',
  'blocks',
  'files',
  'firstAscensionists',
  'geolocations',
  'routeExternalResource27crags',
  'routeExternalResource8a',
  'routeExternalResources',
  'routeExternalResourceTheCrag',
  'routes',
  'routesToFirstAscensionists',
  'routesToTags',
  'topoRoutes',
  'topos',
]

type RegionTable = RegionPreloadTable | 'activities' | 'favorites' | 'regionMembers'

type RegionQuery<TReturn> = Query<RegionTable, Schema, TReturn>

export type QueryContext = {
  authUserId: string | undefined
  pageState?: Partial<App.SafeSession>
}

const addRegionCheck = <
  TContext extends QueryContext | null | undefined,
  TReturn,
  TReturnQuery extends RegionQuery<TReturn>,
>(
  ctx: TContext,
  q: TReturnQuery,
): TReturnQuery => {
  if (ctx?.pageState?.userRegions == null) {
    return q
  }

  return q.where(
    'regionFk',
    'IN',
    ctx.pageState.userRegions.map((region) => region.regionFk),
  ) as TReturnQuery
}

const authenticatedUserCan =
  <
    TInput extends ReadonlyJSONValue | undefined,
    TOutput extends ReadonlyJSONValue | undefined,
    TContext = QueryContext,
    TSchema extends Schema = Schema,
    TTable extends keyof TSchema['tables'] & string = keyof TSchema['tables'] & string,
    TReturn = PullRow<TTable, TSchema>,
  >(
    cb: Parameters<
      typeof defineQuery<
        TInput,
        TOutput,
        Omit<TContext, 'authUserId'> & { authUserId: string },
        TSchema,
        TTable,
        TReturn
      >
    >[1],
  ) =>
  (options: Parameters<typeof cb>[0]) => {
    if (options.ctx == null) {
      throw new Error('Not allowed')
    }

    return cb(options)
  }

const regionMemberCan =
  <
    TInput extends ReadonlyJSONValue | undefined,
    TOutput extends ReadonlyJSONValue | undefined,
    TContext = QueryContext,
    TSchema extends Schema = Schema,
    TTable extends RegionTable = RegionTable,
    TReturn = PullRow<TTable, TSchema>,
  >(
    cb: Parameters<
      typeof defineQuery<
        TInput,
        TOutput,
        Omit<TContext, 'authUserId'> & { authUserId: string },
        TSchema,
        TTable,
        TReturn
      >
    >[1],
  ) =>
  (options: Parameters<typeof cb>[0]) => {
    const q = cb(options)
    return addRegionCheck<QueryContext, TReturn, Query<TTable, Schema, TReturn>>(options.ctx, q)
  }

const relatedRegion =
  <TContext extends QueryContext | null | undefined>(ctx: TContext) =>
  <TReturnQuery extends RegionQuery<any>>(q: TReturnQuery): TReturnQuery => {
    return addRegionCheck(ctx, q)
  }

export const queries = defineQueries({
  grades: defineQuery(
    z.undefined(),
    authenticatedUserCan(() => {
      return zql.grades
    }),
  ),
  tags: defineQuery(
    z.undefined(),
    authenticatedUserCan(() => {
      return zql.tags
    }),
  ),
  regions: defineQuery(
    z.undefined(),
    authenticatedUserCan(({ ctx }) => {
      return zql.regions.whereExists('members', (q) => q.where('authUserFk', ctx.authUserId))
    }),
  ),
  rolePermissions: defineQuery(z.undefined(), () => {
    return zql.rolePermissions
  }),

  currentUser: defineQuery(
    z.undefined(),
    authenticatedUserCan(({ ctx }) => {
      return zql.users.where('authUserFk', ctx.authUserId).related('userSettings').related('favorites').one()
    }),
  ),
  currentUserRoles: defineQuery(
    z.undefined(),
    authenticatedUserCan(({ ctx }) => {
      return zql.userRoles.where('authUserFk', ctx.authUserId).one()
    }),
  ),
  currentUserRegions: defineQuery(
    z.undefined(),
    authenticatedUserCan(({ ctx }) => {
      return zql.regionMembers.where('authUserFk', ctx.authUserId).where('isActive', 'IS NOT', null).related('region')
    }),
  ),

  listUsers: defineQuery(
    z.object({
      content: z.string().optional(),
      id: z.union([z.number(), z.array(z.number())]).optional(),
    }),
    authenticatedUserCan(({ args, ctx }) => {
      const r = relatedRegion(ctx)

      let q = zql.users.whereExists('regionMemberships', r)

      if (args.id != null) {
        if (Array.isArray(args.id)) {
          q = q.where('id', 'IN', args.id)
        } else {
          q = q.where('id', args.id)
        }
      }

      if (args.content != null) {
        q = q.where('username', 'ILIKE', `%${args.content}%`)
      }

      return q
    }),
  ),

  listAreas: defineQuery(
    z.object({
      areaId: z.union([z.number(), z.array(z.number())]).optional(),
      content: z.string().optional(),
      parentFk: z.number().optional().nullish(),
    }),
    regionMemberCan(({ args, ctx }) => {
      const r = relatedRegion(ctx)

      let q = zql.areas
        .orderBy('name', 'asc')
        .related('parent', (q) => r(q).related('parent', r))
        .related('parkingLocations', r)

      if (args.areaId != null) {
        if (Array.isArray(args.areaId)) {
          q = q.where('id', 'IN', args.areaId)
        } else {
          q = q.where('id', args.areaId)
        }
      }

      if (args.parentFk !== undefined) {
        q = q.where('parentFk', 'IS', args.parentFk)
      }

      if (args.content != null) {
        q = q.where((q) =>
          q.or(q.cmp('name', 'ILIKE', `%${args.content}%`), q.cmp('description', 'ILIKE', `%${args.content}%`)),
        )
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

  favorites: defineQuery(
    z.object({
      authUserFk: z.string().optional(),
      entity: z
        .object({
          type: z.enum(favoriteEntityType),
          id: z.string(),
        })
        .optional(),
    }),
    regionMemberCan(({ args }) => {
      let q = zql.favorites

      if (args.authUserFk != null) {
        q = q.where('authUserFk', args.authUserFk)
      }

      if (args.entity != null) {
        q = q.where('entityType', args.entity.type).where('entityId', args.entity.id)
      }

      return q
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

    const listRoutes = (ctx: QueryContext | null | undefined, opts: z.infer<typeof schema>) => {
      const r = relatedRegion(ctx)

      let q = zql.routes.related('tags', r).related('firstAscents', r)

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
      listRoutes: defineQuery(
        schema,
        regionMemberCan(({ args, ctx }) => {
          return listRoutes(ctx, args)
        }),
      ),
      listRoutesWithRelations: defineQuery(
        schema,
        regionMemberCan(({ args, ctx }) => {
          const r = relatedRegion(ctx)

          return listRoutes(ctx, args)
            .related('ascents', (q) =>
              args.userId == null ? r(q).where('createdBy', 'IS', null) : r(q).where('createdBy', '=', args.userId),
            )
            .related('block', (q) =>
              r(q).related('area', (q) =>
                r(q).related('parent', (q) =>
                  r(q).related('parent', (q) => r(q).related('parent', (q) => r(q).related('parent', r))),
                ),
              ),
            )
        }),
      ),
      listRoutesWithExternalResources: defineQuery(
        schema,
        regionMemberCan(({ args, ctx }) => {
          const r = relatedRegion(ctx)

          return listRoutes(ctx, args)
            .related('block', r)
            .related('externalResources', (q) =>
              r(q)
                .related('externalResource27crags', r)
                .related('externalResource8a', r)
                .related('externalResourceTheCrag', r),
            )
        }),
      ),
      listRoutesWithAscents: defineQuery(
        schema,
        regionMemberCan(({ args, ctx }) => {
          const r = relatedRegion(ctx)

          return listRoutes(ctx, args).related('ascents', (q) =>
            args.userId == null ? r(q) : r(q).where('createdBy', '=', args.userId),
          )
        }),
      ),
    }
  })(),
  route: defineQuery(
    z.object({
      areaId: z.number().optional(),
      blockSlug: z.string().optional(),
      routeSlug: z.string(),
    }),
    regionMemberCan(({ args, ctx }) => {
      const r = relatedRegion(ctx)

      function getRouteDbFilterRaw(routeSlug: string, q: Query<'routes', Schema>): Query<'routes', Schema> {
        return Number.isNaN(Number(routeSlug)) ? q.where('slug', routeSlug) : q.where('id', Number(routeSlug))
      }

      let q = zql.blocks

      if (args.areaId != null) {
        q = q.where('areaFk', args.areaId)
      }

      if (args.blockSlug != null) {
        q = q.where('slug', args.blockSlug)
      }

      return q
        .related('area', (q) => r(q).related('parent', (q) => r(q).related('parent', (q) => r(q).related('parent', r))))
        .whereExists('routes', (q) => getRouteDbFilterRaw(args.routeSlug, r(q)))
        .related('routes', (q) =>
          getRouteDbFilterRaw(args.routeSlug, r(q))
            .related('tags', r)
            .related('firstAscents', (q) => r(q).related('firstAscensionist', (q) => r(q).related('user')))
            .related('externalResources', (q) =>
              r(q)
                .related('externalResource27crags', r)
                .related('externalResource8a', r)
                .related('externalResourceTheCrag', r),
            ),
        )
        .related('topos', r)
        .one()
    }),
  ),

  listAscents: defineQuery(
    z.object({
      ascentId: z.union([z.number(), z.array(z.number())]).optional(),
      createdBy: z.number().optional().nullable(),
      grade: z.number().optional().nullable(),
      notes: z.string().optional(),
      routeId: z.number().optional().nullable(),
      types: z.array(z.enum(ascentTypeEnum)).optional(),
    }),
    regionMemberCan(({ args, ctx }) => {
      const r = relatedRegion(ctx)

      let q = zql.ascents.related('author').related('route', r).related('files', r)

      if (args.ascentId != null) {
        if (Array.isArray(args.ascentId)) {
          q = q.where('id', 'IN', args.ascentId)
        } else {
          q = q.where('id', args.ascentId)
        }
      }

      if (args.createdBy != null) {
        q = q.where('createdBy', args.createdBy)
      }

      if (args.routeId != null) {
        q = q.where('routeFk', args.routeId)
      }

      if (args.grade === null) {
        q = q.where('gradeFk', 'IS NOT', null)
      }

      if (args.notes != null) {
        q = q.where('notes', 'ILIKE', `%${args.notes}%`)
      }

      if (args.types != null) {
        q = q.where('type', 'IN', args.types)
      }

      return q
    }),
  ),
  ascent: defineQuery(
    z.object({
      id: z.number(),
    }),
    regionMemberCan(({ args, ctx }) => {
      const r = relatedRegion(ctx)

      return zql.ascents
        .where('id', args.id)
        .related('author')
        .related('route', (q) =>
          r(q).related('block', (q) =>
            r(q).related('area', (q) =>
              r(q).related('parent', (q) => r(q).related('parent', (q) => r(q).related('parent', r))),
            ),
          ),
        )
        .one()
    }),
  ),

  listFiles: defineQuery(
    z.object({
      entity: z
        .object({
          type: z.enum(['area', 'ascent', 'route']),
          id: z.union([z.number(), z.array(z.number())]),
        })
        .optional(),
      fileId: z.union([z.string(), z.array(z.string())]).optional(),
    }),
    regionMemberCan(({ args, ctx }) => {
      const r = relatedRegion(ctx)

      let q = zql.files.related('area', r).related('ascent', r).related('block', r).related('route', r)

      if (args.fileId != null) {
        if (Array.isArray(args.fileId)) {
          q = q.where('id', 'IN', args.fileId)
        } else {
          q = q.where('id', args.fileId)
        }
      }

      if (args.entity != null) {
        const type = args.entity.type === 'area' ? 'areaFk' : args.entity.type === 'ascent' ? 'ascentFk' : 'routeFk'

        if (Array.isArray(args.entity.id)) {
          q = q.where(type, 'IN', args.entity.id)
        } else {
          q = q.where(type, args.entity.id)
        }
      }

      return q
    }),
  ),

  firstAscensionists: defineQuery(
    z.undefined(),
    regionMemberCan(() => {
      return zql.firstAscensionists.orderBy('name', 'asc').related('user')
    }),
  ),

  listAllUsers: defineQuery(
    z.undefined(),
    authenticatedUserCan(({ ctx }) => {
      const r = relatedRegion(ctx)

      return zql.users.whereExists('regionMemberships', r)
    }),
  ),

  activities: defineQuery(
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
    regionMemberCan(({ args }) => {
      let q = zql.activities.orderBy('createdAt', 'desc').related('user').limit(args.pageSize)

      const { entity } = args

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

      if (args.type != null) {
        q = q.where('type', args.type)
      }

      if (args.userFk != null) {
        q = q.where('userFk', args.userFk)
      }

      return q
    }),
  ),

  ...regionPreloadTables.reduce((obj, table) => {
    const capitalizedTable = table.charAt(0).toUpperCase() + table.slice(1)
    const name = `listAll${capitalizedTable}`

    return {
      ...obj,
      [name]: defineQuery(
        z.null(),
        regionMemberCan<ReadonlyJSONValue, ReadonlyJSONValue>(() => zql[table]),
      ),
    }
  }, {}),
})
