import type { AscentStatus, RouteListFilter } from '$lib/entities/route/resources.svelte'

/**
 * Every URL search param the route filter owns, listed once so the modal's
 * reset and the "is anything applied" check stay in sync as filters are added.
 */
export const FILTER_PARAM_KEYS = [
  'minGrade',
  'maxGrade',
  'minRating',
  'ascentStatus',
  'tags',
  'hasTopo',
  'hasBeta',
  'favorites',
  'firstAscensionists',
] as const

export interface ParsedRouteFilter {
  /** Params the Zero `listRoutes` query understands (filtered server-side). */
  filter: RouteListFilter
  /** Tick status, filtered client-side from the signed-in user's ascents. */
  ascentStatus: AscentStatus | undefined
  /** Whether to keep only the user's favorited routes (client-side). */
  favoritesOnly: boolean
}

export const isAscentStatus = (value: string | null): value is AscentStatus =>
  value === 'done' || value === 'todo' || value === 'project'

/** Reads the explore URL's search params into typed route-filter values. */
export const parseRouteFilter = (params: URLSearchParams): ParsedRouteFilter => {
  const minGrade = params.get('minGrade')
  const maxGrade = params.get('maxGrade')
  const minRating = params.get('minRating')
  const tags = params.get('tags')
  const firstAscensionists = params.get('firstAscensionists')
  const ascentStatus = params.get('ascentStatus')

  return {
    filter: {
      minGrade: minGrade == null ? undefined : Number(minGrade),
      maxGrade: maxGrade == null ? undefined : Number(maxGrade),
      minRating: minRating == null ? undefined : Number(minRating),
      tags: tags ? tags.split(',') : undefined,
      firstAscensionists: firstAscensionists ? firstAscensionists.split(',').map(Number) : undefined,
      hasTopo: params.get('hasTopo') === '1' ? true : undefined,
      hasBeta: params.get('hasBeta') === '1' ? true : undefined,
    },
    ascentStatus: isAscentStatus(ascentStatus) ? ascentStatus : undefined,
    favoritesOnly: params.get('favorites') === '1',
  }
}

/** True when any route filter is currently applied. */
export const isFilterActive = (params: URLSearchParams): boolean => FILTER_PARAM_KEYS.some((key) => params.has(key))
