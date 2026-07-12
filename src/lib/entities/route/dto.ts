import type { TopoPoint } from '$lib/entities/topo/dto'

/** The map's per-route data: just what the donut counts and Filter need. */
export interface RouteMapItem {
  id: number
  blockFk: number | null
  gradeFk: number | undefined
}

export interface RouteListItem {
  createdAt: Date | undefined
  blockFk: number
  description: string
  firstAscentYear: number | undefined
  gradeFk: number | undefined
  id: number
  name: string
  rating: number
  tags: string[]
  userRating: number
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
  /** The route's first ascensionists, for the edit form's picker. */
  firstAscents: { name: string; userFk: number | undefined }[]
}
