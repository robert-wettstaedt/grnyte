import type { RouteListItem } from '$lib/entities/route/dto'
import { nameCollator } from '$lib/i18n/collator'

export type SortDir = 'asc' | 'desc'
export type SortField = 'distance' | 'grade' | 'name' | 'rating'

export const SORT_FIELDS = ['grade', 'name', 'rating', 'distance'] as const

/** Sensible default direction per field (hardest grade / best rating / nearest first). */
export const DEFAULT_DIR: Record<SortField, SortDir> = {
  distance: 'asc',
  grade: 'desc',
  name: 'asc',
  rating: 'desc',
}

const isSortField = (value: null | string): value is SortField => SORT_FIELDS.includes(value as SortField)

/** Reads `sort`/`dir` URL params into a typed sort state, defaulting to grade, hardest first. */
export const parseSort = (params: URLSearchParams): { dir: SortDir; field: SortField } => {
  const field = isSortField(params.get('sort')) ? (params.get('sort') as SortField) : 'grade'
  const dirParam = params.get('dir')
  const dir: SortDir = dirParam === 'asc' || dirParam === 'desc' ? dirParam : DEFAULT_DIR[field]
  return { dir, field }
}

/**
 * Sorts routes by the chosen field/direction. Ungraded routes sort as the lowest
 * grade; `distance` is metres from the user (Infinity when unknown, so those
 * routes sink to the bottom when sorting nearest-first).
 *
 * @param distance per-route metres accessor, supplied by the page since it needs
 *   the user's location and block coordinates.
 */
export function sortRoutes(
  routes: readonly RouteListItem[],
  field: SortField,
  dir: SortDir,
  distance: (route: RouteListItem) => number,
): RouteListItem[] {
  const mul = dir === 'asc' ? 1 : -1
  // Resolved once rather than per comparison: an area can hold thousands of routes.
  const byName = nameCollator()
  const compare = (a: RouteListItem, b: RouteListItem): number => {
    switch (field) {
      case 'name':
        return byName.compare(a.name, b.name) * mul
      case 'rating':
        return (a.rating - b.rating) * mul
      case 'distance':
        return (distance(a) - distance(b)) * mul
      case 'grade':
        return ((a.gradeFk ?? -Infinity) - (b.gradeFk ?? -Infinity)) * mul
    }
  }
  return [...routes].sort(compare)
}
