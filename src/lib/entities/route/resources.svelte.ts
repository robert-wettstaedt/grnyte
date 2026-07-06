import { queries } from '$lib/zero/queries'
import { createResource } from '$lib/zero/resource.svelte'
import { getZ } from '$lib/zero/z.svelte'
import { toRouteDetail, toRouteListItem } from './mapper'

export type AscentStatus = 'done' | 'todo' | 'project'

export interface RouteListFilter {
  areaId?: number
  content?: string
  firstAscensionists?: number[]
  hasBeta?: boolean
  hasTopo?: boolean
  maxGrade?: number
  minGrade?: number
  minRating?: number
  parentFk?: number
  /** Find routes whose description references the given `!type:id!` token (backlinks). */
  references?: string
  tags?: string[]
}

export function routeList(filter: () => RouteListFilter = () => ({})) {
  return createResource(
    () => queries.listRoutes(filter()),
    (rows) => rows.map(toRouteListItem),
  )
}

export function routeDetail(id: () => number) {
  return createResource(
    () => queries.listRoutes({ routeId: id() }),
    (rows) => (rows[0] == null ? undefined : toRouteDetail(rows[0])),
  )
}

/**
 * Resolve once Zero has the live route row for `id` locally, or after `timeoutMs`.
 * Mirrors {@link waitForBlock}: defers a post-restore redirect until the recreated
 * row has synced, so the route detail renders instead of flashing "not found".
 * ponytail: 5s cap is the ceiling, a slower sync just lands on the loading state.
 */
export function waitForRoute(id: number, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve) => {
    const view = getZ().materialize(queries.listRoutes({ routeId: id }))
    const finish = () => {
      clearTimeout(timer)
      view.destroy()
      resolve()
    }
    const timer = setTimeout(finish, timeoutMs)
    view.addListener((rows) => {
      if (rows.length > 0) finish()
    })
  })
}
