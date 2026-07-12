import { routeTopoThumb } from '$lib/entities/topo/mapper'
import { m } from '$lib/paraglide/messages'
import { queries } from '$lib/zero/queries'
import type { QueryRow } from '$lib/zero/types'
import type { RouteDetail, RouteListItem } from './dto'

export type RouteListRow = QueryRow<typeof queries.listRoutes>

export function toRouteListItem(row: RouteListRow): RouteListItem {
  const thumb = routeTopoThumb(row.topoRoutes ?? [])
  return {
    blockFk: row.blockFk,
    createdAt: row.createdAt == null ? undefined : new Date(row.createdAt),
    description: row.description ?? '',
    firstAscentYear: row.firstAscentYear ?? undefined,
    gradeFk: row.userGradeFk ?? undefined,
    id: row.id,
    name: row.name.length === 0 ? m.common_unnamed() : row.name,
    rating: row.userRating ?? 0,
    tags: row.tags.map((t) => t.tagFk),
    topoImagePath: thumb?.imagePath,
    topoPoints: thumb?.points,
  }
}

export function toRouteDetail(row: RouteListRow): RouteDetail {
  return {
    ...toRouteListItem(row),
    regionFk: row.regionFk,
    rawName: row.name,
    rawGradeFk: row.gradeFk ?? undefined,
    rawRating: row.rating ?? 0,
    firstAscents: row.firstAscents.flatMap((fa) =>
      fa.firstAscensionist == null
        ? []
        : [{ name: fa.firstAscensionist.name, userFk: fa.firstAscensionist.userFk ?? undefined }],
    ),
  }
}
