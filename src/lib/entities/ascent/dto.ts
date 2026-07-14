import type { MediaFile } from '$lib/entities/file/dto'

export type AscentType = 'flash' | 'send' | 'repeat' | 'attempt'

/** Minimal ascent shape used to derive a user's tick status per route. */
export interface UserAscent {
  routeFk: number
  type: AscentType
}

/** One ascent of a route: the climber's take on it and any attached media. */
export interface RouteAscent {
  id: number
  /** The climber's username; empty while the author row hasn't synced. */
  authorName: string
  createdBy: number
  /** Epoch millis (Zero maps the pg `date` column to a number). */
  dateTime: number | undefined
  gradeFk: number | undefined
  humidity: number | undefined
  notes: string
  rating: number | undefined
  regionFk: number
  temperature: number | undefined
  type: AscentType
  files: MediaFile[]
}

/** Full ascent shape for the edit form. */
export interface AscentDetail extends Omit<RouteAscent, 'authorName'> {
  routeFk: number
}
