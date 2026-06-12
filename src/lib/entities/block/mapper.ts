import { toAncestors, type AreaAncestor } from '$lib/entities/area/mapper'
import { toGeolocation } from '$lib/entities/geolocation/mapper'
import { m } from '$lib/paraglide/messages'
import type { Row } from '$lib/zero/types'
import type { BlockDetail, BlockListItem } from './dto'

interface BlockRow {
  readonly id: number
  readonly name: string
  readonly order: number
  readonly slug: string
  readonly area?: AreaAncestor | undefined
}

/** What `toBlockDetail` reads — satisfied by both the list and the single-block query. */
interface BlockDetailRow extends BlockRow {
  readonly createdAt: number | null
  readonly geolocation?: Row<'geolocations'> | undefined
}

export function toBlockListItem(row: BlockRow): BlockListItem {
  return {
    areas: toAncestors(row.area),
    id: row.id,
    name: row.name.length === 0 ? `${m.common_block()} ${row.order}` : row.name,
    order: row.order,
    slug: row.slug,
  }
}

export function toBlockDetail(row: BlockDetailRow): BlockDetail {
  return {
    ...toBlockListItem(row),
    createdAt: row.createdAt == null ? undefined : new Date(row.createdAt),
    geolocation: row.geolocation == null ? undefined : toGeolocation(row.geolocation),
  }
}
