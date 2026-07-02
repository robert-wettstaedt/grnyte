import { toAncestors, type AreaAncestor } from '$lib/entities/area/mapper'
import { toGeolocation } from '$lib/entities/geolocation/mapper'
import { m } from '$lib/paraglide/messages'
import type { Row } from '$lib/zero/types'
import type { BlockDetail, BlockListItem } from './dto'

interface BlockRow {
  readonly id: number
  readonly name: string
  readonly order: number
  readonly regionFk: number
  readonly area?: AreaAncestor | undefined
}

/** What `toBlockDetail` reads — satisfied by both the list and the single-block query. */
interface BlockDetailRow extends BlockRow {
  readonly createdAt: number | null
  readonly geolocation?: Row<'geolocations'> | undefined
  readonly topos?: readonly { readonly file?: { readonly path: string | null } | null | undefined }[]
}

export function toBlockListItem(row: BlockRow): BlockListItem {
  // `toAncestors` returns only the ancestors above the block's immediate area, so
  // append that immediate area to get the full containment chain (e.g. [area, crag]).
  const areas = toAncestors(row.area)
  if (row.area != null) {
    areas.push({
      areas: [],
      id: row.area.id,
      name: row.area.name,
      type: row.area.type ?? 'area',
    })
  }

  return {
    areas,
    id: row.id,
    name: row.name.length === 0 ? `${m.common_block()} ${row.order + 1}` : row.name,
    order: row.order,
    regionFk: row.regionFk,
  }
}

export function toBlockDetail(row: BlockDetailRow): BlockDetail {
  return {
    ...toBlockListItem(row),
    createdAt: row.createdAt == null ? undefined : new Date(row.createdAt),
    geolocation: row.geolocation == null ? undefined : toGeolocation(row.geolocation),
    topoImagePaths: (row.topos ?? []).flatMap((topo) => (topo.file?.path == null ? [] : [topo.file.path])),
    rawName: row.name,
  }
}
