import { toAncestors, type AreaAncestor } from '$lib/entities/area/mapper'
import { toGeolocation } from '$lib/entities/geolocation/mapper'
import { m } from '$lib/paraglide/messages'
import type { Locale } from '$lib/paraglide/runtime'
import type { Row } from '$lib/zero/types'
import type { BlockDetail, BlockListItem } from './dto'

/** What `toBlockDetail` reads: satisfied by both the list and the single-block query. */
interface BlockDetailRow extends BlockRow {
  readonly createdAt: null | number
  readonly createdBy: number
  readonly description: null | string
  readonly geolocation?: Row<'geolocations'> | undefined
  readonly topos?: readonly {
    readonly file?:
      | null
      | undefined
      | {
          readonly height?: null | number | undefined
          readonly path: null | string
          readonly width?: null | number | undefined
        }
    readonly id: number
  }[]
}

interface BlockRow {
  readonly area?: AreaAncestor | undefined
  readonly id: number
  readonly name: string
  readonly order: number
  readonly regionFk: number
}

/**
 * A block's display name: its own, or its position in the area when it has none.
 *
 * Exported because the client mapper is not the only renderer: the push digest builds the
 * same name on the server, and a second copy of the fallback would let a notification read
 * "Block 3" while the screen it links to reads something else. `locale` is explicit for that
 * caller, which renders once per recipient rather than in the reader's own session.
 */
export function blockName(name: string, order: number, locale?: Locale): string {
  return name.length === 0 ? `${m.common_block({}, { locale })} ${order + 1}` : name
}

export function toBlockDetail(row: BlockDetailRow): BlockDetail {
  return {
    ...toBlockListItem(row),
    createdAt: row.createdAt == null ? undefined : new Date(row.createdAt),
    createdBy: row.createdBy,
    description: row.description ?? '',
    geolocation: row.geolocation == null ? undefined : toGeolocation(row.geolocation),
    rawName: row.name,
    topoImages: (row.topos ?? []).flatMap((topo) =>
      topo.file?.path == null
        ? []
        : [
            {
              height: topo.file.height ?? undefined,
              id: topo.id,
              path: topo.file.path,
              width: topo.file.width ?? undefined,
            },
          ],
    ),
  }
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
    name: blockName(row.name, row.order),
    order: row.order,
    regionFk: row.regionFk,
  }
}
