import type { AreaDetail } from '$lib/entities/area/dto'
import type { BlockDetail } from '$lib/entities/block/dto'
import type { RouteDetail } from '$lib/entities/route/dto'
import type { MessageKey } from '$lib/i18n/message'

export type MergeKind = 'areas' | 'blocks' | 'routes'

/** One side of a merge as the sheet compares it: the stored values, never the display fallbacks. */
export interface MergeSide {
  crumbs: string[]
  fields: Record<string, unknown>
  /** For a block, its pin: the location field picks between two of these. */
  geolocation?: { id: number; lat: number; long: number }
  id: number
  name: string
  /** The parent its siblings share: the area of an area or block, the block of a route. */
  parentId: null | number
  regionFk: number
}

/** The fields each level asks about, in the order the sheet lists them, with their labels. */
export const MERGE_FIELDS: Record<MergeKind, readonly { key: string; label: MessageKey }[]> = {
  areas: [
    { key: 'name', label: 'event_fieldName' },
    { key: 'description', label: 'event_fieldDescription' },
  ],
  blocks: [
    { key: 'name', label: 'event_fieldName' },
    { key: 'description', label: 'event_fieldDescription' },
    { key: 'geolocationFk', label: 'event_fieldLocation' },
  ],
  routes: [
    { key: 'name', label: 'event_fieldName' },
    { key: 'gradeFk', label: 'event_fieldGrade' },
    { key: 'description', label: 'event_fieldDescription' },
    { key: 'firstAscentYear', label: 'event_fieldFirstAscentYear' },
    { key: 'rating', label: 'event_fieldRating' },
  ],
}

export const crumbs = (row: { areas: { name: string }[] }) => row.areas.map((ancestor) => ancestor.name)

export const areaSide = (area: AreaDetail): MergeSide => ({
  crumbs: crumbs(area),
  fields: { description: area.description, name: area.rawName },
  id: area.id,
  name: area.name,
  parentId: area.parentFk ?? null,
  regionFk: area.regionFk,
})

export const blockSide = (block: BlockDetail): MergeSide => ({
  crumbs: crumbs(block),
  fields: { description: block.description, geolocationFk: block.geolocation?.id ?? null, name: block.rawName },
  geolocation: block.geolocation,
  id: block.id,
  name: block.name,
  parentId: block.areaFk,
  regionFk: block.regionFk,
})

/** The set grade, never the community one, and no rating as null rather than 0 stars. */
export const routeSide = (route: RouteDetail): MergeSide => ({
  crumbs: [route.areaName, route.blockName].filter((crumb) => crumb != null),
  fields: {
    description: route.description,
    firstAscentYear: route.firstAscentYear ?? null,
    gradeFk: route.rawGradeFk ?? null,
    name: route.rawName,
    rating: route.rawRating === 0 ? null : route.rawRating,
  },
  id: route.id,
  name: route.name,
  parentId: route.blockFk,
  regionFk: route.regionFk,
})
