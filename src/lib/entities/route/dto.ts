import type { TopoPoint } from '$lib/entities/topo/dto'

export type RouteDetail = RouteListItem & {
  /** The route's first ascensionists, for the edit form's picker. */
  firstAscents: { name: string; userFk: number | undefined }[]
  /** The grade/rating stored on the route itself (the breakdown's "original grade");
   *  the edit form prefills from these, never from the community values. */
  rawGradeFk: number | undefined
  /** The stored name as typed, empty for unnamed routes. `name` is the display
   *  fallback ("<no name>"); editing must prefill from this so a blank route stays blank. */
  rawName: string
  rawRating: number
  regionFk: number
}

export interface RouteListItem {
  /** Name of the route's area, for a breadcrumb (search results). */
  areaName?: string
  blockFk: number
  /** Name of the route's block, for a breadcrumb (search results). */
  blockName?: string
  createdAt: Date | undefined
  createdBy: number
  description: string
  firstAscentYear: number | undefined
  /** Community grade (`userGradeFk`): the route's own grade averaged with one vote per
   *  user, their latest ascent. This is THE displayed grade; the stored original only
   *  surfaces via {@link RouteDetail.rawGradeFk}. */
  gradeFk: number | undefined
  id: number
  name: string
  /** Community rating (`userRating`), same one-vote-per-user rule as the grade. */
  rating: number
  /** The stored name as typed, empty for unnamed routes (`name` is the "<no name>"
   *  display fallback). Search scores against this so an unnamed route can't match
   *  the placeholder text. */
  rawName?: string
  /** The route's region: drives the permission gates, and a region breadcrumb when a
   *  search spans more than one. */
  regionFk: number
  tags: string[]
  /** `files.path` of the route's best topo image, if it's drawn on one. */
  topoImagePath?: string
  /** The route's line points on that topo. */
  topoPoints?: TopoPoint[]
}

/** The map's per-route data: just what the donut counts and Filter need. */
export interface RouteMapItem {
  blockFk: null | number
  /** Community grade (`userGradeFk`), like {@link RouteListItem.gradeFk}. */
  gradeFk: number | undefined
  id: number
}
