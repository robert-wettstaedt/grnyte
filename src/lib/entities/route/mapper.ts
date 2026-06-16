import { m } from '$lib/paraglide/messages'
import { queries } from '$lib/zero/queries'
import type { QueryRow } from '$lib/zero/types'
import type { RouteListItem } from './dto'

export type RouteListRow = QueryRow<typeof queries.listRoutes>

export function toRouteListItem(row: RouteListRow): RouteListItem {
  return {
    blockFk: row.blockFk,
    createdAt: row.createdAt == null ? undefined : new Date(row.createdAt),
    description: row.description ?? '',
    firstAscentYear: row.firstAscentYear ?? undefined,
    gradeFk: row.gradeFk ?? undefined,
    id: row.id,
    name: row.name.length === 0 ? m.common_unnamed() : row.name,
    rating: row.rating ?? 0,
    tags: row.tags.map((t) => t.tagFk),
    userRating: row.userRating ?? 0,
  }
}
