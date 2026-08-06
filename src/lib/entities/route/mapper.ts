import { routeTopoThumb } from '$lib/entities/topo/mapper'
import { m } from '$lib/paraglide/messages'
import { queries } from '$lib/zero/queries'
import type { QueryRow } from '$lib/zero/types'
import type { RouteDetail, RouteListItem } from './dto'

export type RouteListRow = QueryRow<typeof queries.listRoutes>

/**
 * A route's name for reading, which is the placeholder when it has none.
 *
 * A route may genuinely be nameless, and the swap happens here so nothing downstream ever sees
 * the empty string: a screen that checked for itself would be a second opinion about what a
 * nameless route is called.
 */
export function routeDisplayName(name: string): string {
  return name.length === 0 ? m.common_unnamed() : name
}

export function toRouteDetail(row: RouteListRow): RouteDetail {
  return {
    ...toRouteListItem(row),
    firstAscents: row.firstAscents.flatMap((fa) =>
      fa.firstAscensionist == null
        ? []
        : [{ name: fa.firstAscensionist.name, userFk: fa.firstAscensionist.userFk ?? undefined }],
    ),
    rawGradeFk: row.gradeFk ?? undefined,
    rawName: row.name,
    rawRating: row.rating ?? 0,
    regionFk: row.regionFk,
  }
}

export function toRouteListItem(row: RouteListRow): RouteListItem {
  const thumb = routeTopoThumb(row.topoRoutes ?? [])
  return {
    areaName: row.block?.area?.name,
    blockFk: row.blockFk,
    blockName:
      row.block == null
        ? ''
        : row.block.name.length === 0
          ? `${m.common_block()} ${row.block.order + 1}`
          : row.block.name,
    createdAt: row.createdAt == null ? undefined : new Date(row.createdAt),
    createdBy: row.createdBy,
    description: row.description ?? '',
    firstAscentYear: row.firstAscentYear ?? undefined,
    gradeFk: row.userGradeFk ?? undefined,
    id: row.id,
    name: routeDisplayName(row.name),
    rating: row.userRating ?? 0,
    rawName: row.name,
    regionFk: row.regionFk,
    tags: row.tags.map((t) => t.tagFk),
    topoImagePath: thumb?.imagePath,
    topoPoints: thumb?.points,
  }
}
