import type { MediaFile } from '$lib/entities/file/dto'

/** Full ascent shape for the edit form. */
export interface AscentDetail extends Omit<RouteAscent, 'authorName'> {
  routeFk: number
}

export type AscentType = 'attempt' | 'flash' | 'redpoint' | 'repeat'

/** One ascent of a route: the climber's take on it and any attached media. */
export interface RouteAscent {
  /** The climber's username; empty while the author row hasn't synced. */
  authorName: string
  createdBy: number
  /** Epoch millis (Zero maps the pg `date` column to a number). */
  dateTime: number | undefined
  files: MediaFile[]
  gradeFk: number | undefined
  humidity: number | undefined
  id: number
  notes: string
  rating: number | undefined
  regionFk: number
  temperature: number | undefined
  type: AscentType
}

/** Minimal ascent shape used to derive a user's ascent status per route. */
export interface UserAscent {
  routeFk: number
  type: AscentType
}

/** A user's ascent enriched with its route's name and community grade: the
 *  profile page's sessions, stats and grade histogram all derive from these. */
export interface UserAscentDetail extends RouteAscent {
  /** The route's area name, for the logbook row's location breadcrumb. */
  areaName?: string
  /** The route's block name (auto-numbered fallback applied), for the breadcrumb. */
  blockName?: string
  routeFk: number
  /** The route's community grade (`userGradeFk`): what the grade histogram buckets by. */
  routeGradeFk: number | undefined
  routeName: string
}
