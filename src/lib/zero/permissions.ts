import type { PullRow, Query, ReadonlyJSONValue } from '@rocicorp/zero'
import { defineQuery } from '@rocicorp/zero'
import type { Schema } from './zero-schema'

/**
 * Every table whose rows belong to a region. `regionMemberCan` and `relatedRegion` filter queries
 * over these down to the caller's memberships, so a new region-scoped table has to be listed here
 * before any query over it is safe to expose.
 *
 * "Belongs to a region" means "carries a `regionFk`", and `tenancy.test.ts` asserts exactly that
 * against the generated schema, so the list cannot silently fall behind a migration. `regions`
 * itself is the one region-scoped table that is not on it: it keys on `id` rather than `regionFk`,
 * and `queries.region` spells its membership check out by hand.
 *
 * `activities` is off it because the events tables replaced it. Nothing reads it, and being off
 * this list is what stops a definition naming it, at the type level rather than by review.
 */
export const regionTables = [
  'areas',
  'ascents',
  'blocks',
  'bunnyStreams',
  'changes',
  'events',
  'favorites',
  'files',
  'firstAscensionists',
  'geolocations',
  'notifications',
  'reactions',
  'regionInvitations',
  'regionMembers',
  'routeExternalResource27crags',
  'routeExternalResource8a',
  'routeExternalResources',
  'routeExternalResourceTheCrag',
  'routes',
  'routesToFirstAscensionists',
  'routesToTags',
  'topoRoutes',
  'topos',
] as const satisfies readonly (keyof Schema['tables'])[]

export type QueryContext = {
  authUserId: string | undefined
  pageState?: Partial<App.SafeSession>
}

type RegionQuery<TReturn> = Query<RegionTable, Schema, TReturn>

type RegionTable = (typeof regionTables)[number]

const addRegionCheck = <
  TContext extends null | QueryContext | undefined,
  TReturn,
  TReturnQuery extends RegionQuery<TReturn>,
>(
  ctx: TContext,
  q: TReturnQuery,
): TReturnQuery => {
  // Two callers, and only one of them is a trust boundary. On the client these same definitions
  // run against the local replica, whose contents the server already filtered, and the context
  // there is `{ authUserId }` with no memberships, so returning the query unfiltered can only
  // ever reach rows this device was already allowed to have. On the server, `get-queries` is what
  // decides access, and it refuses to serve a context without memberships rather than reaching
  // this branch. Do not "harden" this into a throw: it breaks every region query in the browser.
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
  <TContext extends null | QueryContext | undefined>(ctx: TContext) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic pass-through; the region shape is irrelevant here
  <TReturnQuery extends RegionQuery<any>>(q: TReturnQuery): TReturnQuery => {
    return addRegionCheck(ctx, q)
  }
