import type { MediaFile } from '$lib/entities/file/dto'

/** Full ascent shape for the edit form. */
export interface AscentDetail extends Omit<RouteAscent, 'authorName'> {
  routeFk: number
}

export type AscentType = 'attempt' | 'flash' | 'repeat' | 'send'

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

/** Minimal ascent shape used to derive a user's tick status per route. */
export interface UserAscent {
  routeFk: number
  type: AscentType
}
