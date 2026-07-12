import type { TopoPoint } from '$lib/entities/topo/dto'

/** The map's per-route data: just what the donut counts and Filter need. */
export interface RouteMapItem {
  id: number
  blockFk: number | null
  /** Community grade (`userGradeFk`), like {@link RouteListItem.gradeFk}. */
  gradeFk: number | undefined
}

export interface RouteListItem {
  createdAt: Date | undefined
  blockFk: number
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
  tags: string[]
  /** `files.path` of the route's best topo image, if it's drawn on one. */
  topoImagePath?: string
  /** The route's line points on that topo. */
  topoPoints?: TopoPoint[]
}

export type RouteDetail = RouteListItem & {
  regionFk: number
  /** The stored name as typed, empty for unnamed routes. `name` is the display
   *  fallback ("<no name>"); editing must prefill from this so a blank route stays blank. */
  rawName: string
  /** The grade/rating stored on the route itself (the breakdown's "original grade");
   *  the edit form prefills from these, never from the community values. */
  rawGradeFk: number | undefined
  rawRating: number
  /** The route's first ascensionists, for the edit form's picker. */
  firstAscents: { name: string; userFk: number | undefined }[]
}
