import type { TopoPoint } from '$lib/entities/topo/dto'

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
