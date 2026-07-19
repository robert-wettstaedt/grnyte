import { queries } from '$lib/zero/queries'
import { createResource, waitForRow } from '$lib/zero/resource.svelte'
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
  /** Cap the result set (e.g. a search preview). */
  pageSize?: number
  /** Find routes whose description references the given `!type:id!` token (backlinks). */
  references?: string
  tags?: string[]
}

export function routeDetail(id: () => number) {
  return createResource(
    () => queries.listRoutes({ routeId: id() }),
    (rows) => (rows[0] == null ? undefined : toRouteDetail(rows[0])),
  )
}

export function routeList(filter: () => RouteListFilter = () => ({}), opts?: { enabled?: () => boolean }) {
  return createResource(
    () => queries.listRoutes(filter()),
    (rows) => rows.map(toRouteListItem),
    opts,
  )
}

/** Slim route rows for the map (no related trees synced) — see `listRoutesForMap`. */
export function routeMapList(filter: () => RouteListFilter = () => ({})) {
  return createResource(
    () => queries.listRoutesForMap(filter()),
    (rows) => rows.map((row) => ({ blockFk: row.blockFk, gradeFk: row.userGradeFk ?? undefined, id: row.id })),
  )
}

/** Resolve once Zero has the live route row for `id` locally, or after `timeoutMs`. See {@link waitForRow}. */
export function waitForRoute(id: number, timeoutMs = 5000): Promise<void> {
  return waitForRow(queries.listRoutes({ routeId: id }), (rows) => rows.length > 0, timeoutMs)
}
