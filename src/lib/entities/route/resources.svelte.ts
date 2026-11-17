import { holdWhileDeleting } from '$lib/zero/deleting.svelte'
import { queries } from '$lib/zero/queries'
import { createResource, waitForRow } from '$lib/zero/resource.svelte'
import type { TTL } from '@rocicorp/zero'
import { toRouteDetail, toRouteListItem } from './mapper'

export type AscentStatus = 'done' | 'project' | 'todo'

export interface RouteListFilter {
  areaId?: number
  content?: string
  firstAscensionists?: number[]
  hasBeta?: boolean
  hasTopo?: boolean
  maxGrade?: number
  minGrade?: number
  minRating?: number
  /** Only routes whose name starts with this (case-insensitive). */
  namePrefix?: string
  /** Cap the result set (e.g. a search preview). */
  pageSize?: number
  /** Find routes whose description references the given `!type:id!` token (backlinks). */
  references?: string
  /** Scope to one region, for the counts that are only meaningful per region. */
  regionFk?: number
  /** Server-side ordering (pairs with `sortOrder`); unsorted otherwise. */
  sort?: 'createdAt' | 'firstAscentYear' | 'grade' | 'name' | 'rating'
  sortOrder?: 'asc' | 'desc'
  tags?: string[]
}

/** The routes beneath an area for its sub-area card: `routeList`'s query, cut to what the card reads. */
export function areaRouteList(filter: () => RouteListFilter) {
  return createResource(
    () => queries.listRoutes(filter()),
    (rows) => rows.map(toRouteListItem).map(({ gradeFk, id }) => ({ gradeFk, id })),
    { offline: () => betaPolicy(filter()) },
  )
}

export function routeDetail(id: () => number, opts?: { enabled?: () => boolean }) {
  const route = createResource(
    () => queries.listRoutes({ routeId: id() }),
    (rows) => (rows[0] == null ? undefined : toRouteDetail(rows[0])),
    opts,
  )
  return holdWhileDeleting(route, 'routes', id)
}

/** Routes as detail DTOs, for the merge sheet. Unordered as it always was: `listRoutes` orders only with both `sort`
 *  and `sortOrder`, and passing the twin's `sortOrder` on would change which rows a page holds. */
export function routeDetailList(filter: () => RouteListFilter, opts?: { enabled?: () => boolean }) {
  return createResource(
    () => {
      const { sortOrder, ...unordered } = filter()
      void sortOrder
      return queries.listRoutes(unordered)
    },
    (rows) => rows.map(toRouteDetail),
    opts,
  )
}

export function routeList(filter: () => RouteListFilter = () => ({}), opts?: { enabled?: () => boolean }) {
  return createResource(
    () => queries.listRoutes(filter()),
    (rows) => rows.map(toRouteListItem),
    { ...opts, offline: () => betaPolicy(filter()) },
  )
}

// Beta lives on media no preload keeps, so a has-beta filter cannot be answered offline.
const betaPolicy = (filter: RouteListFilter): 'excluded' | undefined =>
  filter.hasBeta === true ? 'excluded' : undefined

/** Slim route rows for the map (no related trees synced): see `listRoutesForMap`. */
export function routeMapList(
  filter: () => RouteListFilter = () => ({}),
  opts?: { enabled?: () => boolean; ttl?: TTL },
) {
  return createResource(
    () => queries.listRoutesForMap(filter()),
    // `name` is raw, for search matching only: render through the route mapper.
    (rows) =>
      rows.map((row) => ({
        areaIds: row.areaIds,
        blockFk: row.blockFk,
        gradeFk: row.userGradeFk ?? undefined,
        id: row.id,
        name: row.name,
      })),
    { ...opts, offline: () => betaPolicy(filter()) },
  )
}

/**
 * Full route rows (with topo) for a set of ids: the profile's project and
 * favorite lists hydrate their derived id sets through this. Skipped while the
 * id set is empty; callers reorder the result by their own list.
 */
export function routesByIds(ids: () => number[], opts?: { enabled?: () => boolean; ttl?: TTL }) {
  return createResource(
    () => queries.listRoutes({ routeId: ids() }),
    (rows) => rows.map(toRouteListItem),
    { enabled: () => ids().length > 0 && (opts?.enabled?.() ?? true), ttl: opts?.ttl },
  )
}

/** Resolve once Zero has the live route row for `id` locally, or after `timeoutMs`. See {@link waitForRow}. */
export function waitForRoute(id: number, timeoutMs = 5000): Promise<void> {
  return waitForRow(queries.listRoutes({ routeId: id }), (rows) => rows.length > 0, timeoutMs)
}
