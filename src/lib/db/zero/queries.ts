import type { Query, QueryFn, ReadonlyJSONValue, SyncedQuery } from '@rocicorp/zero'
import { syncedQueryWithContext } from '@rocicorp/zero'
import z from 'zod'
import { activityParentEntityType, activityType } from '../schema'
import { type Schema } from './zero-schema'
import { builder } from './zero-schema.gen'

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

type RegionTable = RegionPreloadTable | 'activities' | 'regionMembers'

type RegionQuery<TReturn> = Query<Schema, RegionTable, TReturn>

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
  <TContext extends QueryContext, TArg extends ReadonlyJSONValue[], TReturnQuery extends Query<any, any, any>>(
    cb: QueryFn<Omit<QueryContext, 'authUserId'> & { authUserId: string }, true, TArg, TReturnQuery>,
  ) =>
  (ctx: TContext | null | undefined, ...args: TArg) => {
    if (ctx?.authUserId == null) {
      throw new Error('Not allowed')
    }

    return cb({ ...ctx, authUserId: ctx.authUserId }, ...args)
  }

const regionMemberCan =
  <
    TContext extends QueryContext | null | undefined,
    TArg extends ReadonlyJSONValue[],
    TReturnQuery extends RegionQuery<any>,
  >(
    cb: QueryFn<TContext, true, TArg, TReturnQuery>,
  ) =>
  (ctx: TContext, ...args: TArg) => {
    const q = cb(ctx, ...args)
    return addRegionCheck(ctx, q)
  }

const relatedRegion =
  <TContext extends QueryContext | null | undefined>(ctx: TContext) =>
  <TReturnQuery extends RegionQuery<any>>(q: TReturnQuery): TReturnQuery => {
    return addRegionCheck(ctx, q)
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
    authenticatedUserCan((ctx) => {
      return builder.regions.whereExists('members', (q) => q.where('authUserFk', ctx.authUserId))
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
    authenticatedUserCan(({ authUserId }) => {
      return builder.users.where('authUserFk', authUserId).related('userSettings').one()
    }),
  ),
  currentUserRoles: syncedQueryWithContext(
    'currentUserRoles',
    z.tuple([]),
    authenticatedUserCan(({ authUserId }) => {
      return builder.userRoles.where('authUserFk', authUserId).one()
    }),
  ),
  currentUserRegions: syncedQueryWithContext(
    'currentUserRegions',
    z.tuple([]),
    authenticatedUserCan(({ authUserId }) => {
      return builder.regionMembers.where('authUserFk', authUserId).where('isActive', 'IS NOT', null).related('region')
    }),
  ),
  listAllUsers: syncedQueryWithContext(
    'listAllUsers',
    z.tuple([]),
    authenticatedUserCan((ctx) => {
      const r = relatedRegion(ctx)

      return builder.users.whereExists('regionMemberships', r)
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

  ...regionPreloadTables.reduce(
    (obj, table) => ({
      ...obj,
      [`listAll${table}`]: syncedQueryWithContext(
        `listAll${table}`,
        z.tuple([]),
        regionMemberCan(() => builder[table]),
      ),
    }),
    {} as Record<
      `listAll${RegionPreloadTable}`,
      SyncedQuery<`listAll${RegionPreloadTable}`, QueryContext, true, ReadonlyJSONValue[], RegionQuery<any>>
    >,
  ),
}
