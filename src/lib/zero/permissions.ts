import type { PullRow, Query, ReadonlyJSONValue } from '@rocicorp/zero'
import { defineQuery } from '@rocicorp/zero'
import type { Schema } from './zero-schema'

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

export const regionPreloadTables: RegionPreloadTable[] = [
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

export const authenticatedUserCan =
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

export const regionMemberCan =
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

export const relatedRegion =
  <TContext extends QueryContext | null | undefined>(ctx: TContext) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic pass-through; the region shape is irrelevant here
  <TReturnQuery extends RegionQuery<any>>(q: TReturnQuery): TReturnQuery => {
    return addRegionCheck(ctx, q)
  }
