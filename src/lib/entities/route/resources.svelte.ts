import { areaToken } from '$lib/entities/area/areaIds'
import { sortByName } from '$lib/i18n/collator'
import { narrowedList, sqlResource, waitForSynced } from '$lib/powersync/resource.svelte'
import { json, toZeroRow } from '$lib/powersync/rows'
import { ROUTE_LIST_SQL, ROUTE_MAP_SQL, ROUTES_BY_ID_SQL } from '$lib/powersync/sql'
import { matchesText } from '$lib/powersync/text'
import { holdWhileDeleting } from '$lib/zero/deleting.svelte'
import type { QueryResource } from '$lib/zero/resource.svelte'
import { toRouteDetail, toRouteListItem, type RouteListRow } from './mapper'

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
  /** Ordering (pairs with `sortOrder`); by id otherwise. */
  sort?: 'createdAt' | 'firstAscentYear' | 'grade' | 'name' | 'rating'
  sortOrder?: 'asc' | 'desc'
  tags?: string[]
}

/** A `ROUTE_LIST_SQL` row: the route's columns, its related rows as JSON text. */
export type SyncedRoute = Record<string, unknown> & {
  block: null | string
  description?: null | string
  first_ascents: string
  name?: null | string
  tags: string
  topo_routes: string
}

type MapRow = {
  area_ids: string
  block_fk: number
  description: null | string
  id: number
  name: null | string
  user_grade_fk: null | number
}

// The column each sort orders by, then its tie-breaks, as Zero's `listRoutes` ordered them.
const SORTS = {
  createdAt: ['r.created_at', ''],
  firstAscentYear: ['r.first_ascent_year', ''],
  grade: ['r.user_grade_fk', ', r.user_rating desc'],
  name: ['r.name', ''],
  rating: ['r.user_rating', ', r.user_grade_fk asc'],
} as const

const hasText = (filter: RouteListFilter) =>
  filter.content != null || filter.namePrefix != null || filter.references != null

/** `ROUTE_FILTERS`' parameters, in order. */
const filterParameters = (filter: RouteListFilter) =>
  [
    filter.regionFk,
    filter.areaId == null ? null : areaToken(filter.areaId),
    filter.minGrade,
    filter.maxGrade,
    filter.minRating,
    jsonList(filter.tags),
    jsonList(filter.firstAscensionists),
    filter.hasTopo ? 1 : null,
    filter.hasBeta ? 1 : null,
  ].map((value) => value ?? null)

const jsonList = (values?: readonly unknown[]) => (values?.length ? JSON.stringify(values) : null)

// Beta lives on ascents' files too, which the region activity stream carries.
const streamsOf = (filter: RouteListFilter) => (filter.hasBeta ? ['guidebook', 'region_activity'] : 'guidebook')

/** A synced route with its related rows, as `toRouteListItem` reads it. */
export function toRouteRow(row: SyncedRoute): RouteListRow {
  return {
    ...toZeroRow<RouteListRow>('routes', row),
    block: json<RouteListRow['block']>(row.block) ?? undefined,
    firstAscents: json<RouteListRow['firstAscents']>(row.first_ascents) ?? [],
    tags: json<RouteListRow['tags']>(row.tags) ?? [],
    topoRoutes: json<RouteListRow['topoRoutes']>(row.topo_routes) ?? [],
  }
}

const byIds = <TOut>(ids: () => number[], select: (rows: SyncedRoute[]) => TOut, enabled?: () => boolean) =>
  sqlResource(
    () => ROUTES_BY_ID_SQL,
    () => [JSON.stringify(ids())],
    select,
    () => 'guidebook',
    { enabled },
  )

export function routeDetail(id: () => number, opts?: { enabled?: () => boolean }) {
  const route = byIds(
    () => [id()],
    (rows) => (rows[0] == null ? undefined : toRouteDetail(toRouteRow(rows[0]))),
    opts?.enabled,
  )
  return holdWhileDeleting(route, 'routes', id)
}

/** {@link routeList} with each route's first ascents and raw values, for the merge sheet. */
export function routeDetailList(filter: () => RouteListFilter, opts?: { enabled?: () => boolean }) {
  return routeRows(filter, toRouteDetail, opts)
}

/**
 * Routes with tags, first ascents, block and topo. A text search matches the bare rows in JS, then reads the related
 * rows of the hits only: building them for the whole region cost 300 ms at 4x throttle, the bare rows 60 (D1).
 */
export function routeList(filter: () => RouteListFilter = () => ({}), opts?: { enabled?: () => boolean }) {
  return routeRows(filter, toRouteListItem, opts)
}

/** Slim route rows for the map (no related rows). `name` is raw, for search matching only. */
export function routeMapList(filter: () => RouteListFilter = () => ({}), opts?: { enabled?: () => boolean }) {
  const parameters = $derived(filterParameters(filter()))
  return sqlResource(
    () => ROUTE_MAP_SQL,
    () => parameters,
    (rows: MapRow[]) =>
      rows.filter(matchesText(filter())).map((row) => ({
        areaIds: row.area_ids,
        blockFk: row.block_fk,
        gradeFk: row.user_grade_fk ?? undefined,
        id: row.id,
        name: row.name,
      })),
    () => streamsOf(filter()),
    opts,
  )
}

/**
 * Full route rows (with topo) for a set of ids: the profile's project and
 * favorite lists hydrate their derived id sets through this. Skipped while the
 * id set is empty; callers reorder the result by their own list.
 */
export function routesByIds(ids: () => number[], opts?: { enabled?: () => boolean }) {
  return byIds(
    ids,
    (rows) => rows.map((row) => toRouteListItem(toRouteRow(row))),
    () => ids().length > 0 && (opts?.enabled?.() ?? true),
  )
}

/** Resolve once the route row for `id` has synced, or after `timeoutMs`. See {@link waitForSynced}. */
export function waitForRoute(id: number, timeoutMs = 5000): Promise<void> {
  return waitForSynced('routes', id, timeoutMs)
}

function routeRows<T extends { id: number }>(
  filter: () => RouteListFilter,
  map: (row: RouteListRow) => T,
  opts?: { enabled?: () => boolean },
): QueryResource<T[]> {
  const order = $derived.by(() => {
    const { sort, sortOrder } = filter()
    const by = sort != null && sortOrder != null && Object.hasOwn(SORTS, sort) ? SORTS[sort] : undefined
    return by == null ? 'order by r.nid' : `order by ${by[0]} ${sortOrder === 'desc' ? 'desc' : 'asc'}${by[1]}, r.nid`
  })
  // Text, and names in the reader's language (SQLite compares bytes), are matched and ordered in JS over bare rows.
  const byName = $derived(filter().sort === 'name')
  const text = $derived(hasText(filter()) || byName)
  const enabled = () => opts?.enabled?.() !== false
  const toItems = (rows: SyncedRoute[]) => rows.map((row) => map(toRouteRow(row)))

  const all = sqlResource(
    () => `${ROUTE_LIST_SQL} ${order} limit ?10`,
    () => [...filterParameters(filter()), filter().pageSize ?? -1],
    toItems,
    () => streamsOf(filter()),
    { enabled: () => !text && enabled() },
  )
  const hits = sqlResource(
    () => `${ROUTE_MAP_SQL} ${order}`,
    () => filterParameters(filter()),
    (rows: MapRow[]) => {
      const matched = rows.filter(matchesText(filter()))
      const named = byName ? sortByName(matched) : matched
      return (byName && filter().sortOrder === 'desc' ? named.toReversed() : named)
        .slice(0, filter().pageSize)
        .map((row) => row.id)
    },
    () => streamsOf(filter()),
    { enabled: () => text && enabled() },
  )
  const found = byIds(
    () => hits.data,
    toItems,
    () => text && enabled() && hits.data.length > 0,
  )

  return narrowedList(() => text, all, hits, found)
}
