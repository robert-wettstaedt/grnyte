import type { AreaListItem } from '$lib/entities/area/dto'
import type { BlockListItem } from './dto'

/**
 * Shape a block as the area-trail object `<Breadcrumb>` wants. The block's `areas`
 * is already the full containment chain down to its immediate area, so it stands
 * in as the trail; `type: null` because a block isn't an area kind.
 */
export function blockBreadcrumbArea(block: BlockListItem): AreaListItem & { regionFk: number } {
  return {
    id: block.id,
    name: block.name,
    type: null,
    areas: block.areas,
    regionFk: block.regionFk,
  }
}
