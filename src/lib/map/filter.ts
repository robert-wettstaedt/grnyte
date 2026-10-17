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
  /** Ascent status, filtered client-side from the signed-in user's ascents. */
  ascentStatus: AscentStatus | undefined
  /** Whether to keep only the user's favorited routes (client-side). */
  favoritesOnly: boolean
  /** Params the Zero `listRoutes` query understands (filtered server-side). */
  filter: RouteListFilter
}

export const isAscentStatus = (value: null | string): value is AscentStatus =>
  value === 'done' || value === 'todo' || value === 'project'

/** A hand-edited or truncated link must not reach the query, which rejects NaN: anything unreadable is unset. */
const finite = (value: null | string): number | undefined => {
  const number = value == null || value.trim() === '' ? NaN : Number(value)
  return Number.isFinite(number) ? number : undefined
}

/** A comma list of ids, dropping the unreadable ones; `undefined` when none is left. */
const ids = (value: null | string): number[] | undefined => {
  const list = value?.split(',').flatMap((part) => finite(part) ?? [])
  return list?.length ? list : undefined
}

/** Reads the explore URL's search params into typed route-filter values. */
export const parseRouteFilter = (params: URLSearchParams): ParsedRouteFilter => {
  const minGrade = params.get('minGrade')
  const maxGrade = params.get('maxGrade')
  const minRating = params.get('minRating')
  const tags = params.get('tags')
  const firstAscensionists = params.get('firstAscensionists')
  const ascentStatus = params.get('ascentStatus')

  return {
    ascentStatus: isAscentStatus(ascentStatus) ? ascentStatus : undefined,
    favoritesOnly: params.get('favorites') === '1',
    filter: {
      firstAscensionists: ids(firstAscensionists),
      hasBeta: params.get('hasBeta') === '1' ? true : undefined,
      hasTopo: params.get('hasTopo') === '1' ? true : undefined,
      maxGrade: finite(maxGrade),
      minGrade: finite(minGrade),
      minRating: finite(minRating),
      tags: tags ? tags.split(',') : undefined,
    },
  }
}

/** Writes what {@link parseRouteFilter} reads, in place: defaults (unset, empty list, `false`, rating 0)
 *  are deleted and keys the filter does not own stay where they are. */
export const writeRouteFilter = (params: URLSearchParams, parsed: ParsedRouteFilter): void => {
  const { filter } = parsed
  const list = (values: (number | string)[] | undefined) => (values?.length ? values.join(',') : undefined)
  const values: Record<(typeof FILTER_PARAM_KEYS)[number], string | undefined> = {
    ascentStatus: parsed.ascentStatus,
    favorites: parsed.favoritesOnly ? '1' : undefined,
    firstAscensionists: list(filter.firstAscensionists),
    hasBeta: filter.hasBeta ? '1' : undefined,
    hasTopo: filter.hasTopo ? '1' : undefined,
    maxGrade: filter.maxGrade == null ? undefined : String(filter.maxGrade),
    minGrade: filter.minGrade == null ? undefined : String(filter.minGrade),
    minRating: filter.minRating == null || filter.minRating <= 0 ? undefined : String(filter.minRating),
    tags: list(filter.tags),
  }

  // In key-list order: `set` appends a new key, so this order is the order a fresh URL gets.
  for (const key of FILTER_PARAM_KEYS) {
    const value = values[key]
    if (value == null) params.delete(key)
    else params.set(key, value)
  }
}

/** True when any route filter is currently applied. */
export const isFilterActive = (params: URLSearchParams): boolean => FILTER_PARAM_KEYS.some((key) => params.has(key))

/** {@link isFilterActive} for already-parsed values, for callers holding a `ParsedRouteFilter`. */
export const isParsedFilterActive = (parsed: ParsedRouteFilter): boolean =>
  Object.values(parsed.filter).some((value) => value !== undefined) ||
  parsed.ascentStatus !== undefined ||
  parsed.favoritesOnly
