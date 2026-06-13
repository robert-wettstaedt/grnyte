import { queries } from '$lib/zero/queries'
import { createResource } from '$lib/zero/resource.svelte'
import { toRouteListItem } from './mapper'

export type AscentStatus = 'done' | 'todo' | 'project'

export interface RouteListFilter {
  content?: string
  maxGrade?: number
  minGrade?: number
  minRating?: number
  parentFk?: number
}

export function routeList(filter: () => RouteListFilter = () => ({})) {
  return createResource(
    () => queries.listRoutes(filter()),
    (rows) => rows.map(toRouteListItem),
  )
}
