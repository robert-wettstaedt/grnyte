import { blockName } from '$lib/entities/block/mapper'
import { toDisplayName } from '$lib/entities/displayName'
import { routeTopoThumb } from '$lib/entities/topo/mapper'
import { queries } from '$lib/zero/queries'
import type { QueryRow } from '$lib/zero/types'
import type { RouteDetail, RouteListItem } from './dto'

export type RouteListRow = QueryRow<typeof queries.listRoutes>

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
    areaName: row.block?.area == null ? undefined : toDisplayName(row.block.area.name),
    blockFk: row.blockFk,
    blockName: row.block == null ? undefined : blockName(row.block.name, row.block.order),
    createdAt: row.createdAt == null ? undefined : new Date(row.createdAt),
    createdBy: row.createdBy,
    description: row.description ?? '',
    firstAscentYear: row.firstAscentYear ?? undefined,
    gradeFk: row.userGradeFk ?? undefined,
    id: row.id,
    name: toDisplayName(row.name),
    rating: row.userRating ?? 0,
    rawName: row.name,
    regionFk: row.regionFk,
    tags: row.tags.map((t) => t.tagFk),
    topoImagePath: thumb?.imagePath,
    topoPoints: thumb?.points,
  }
}
