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
  createdBy: number
  /** Epoch millis (Zero maps the pg `date` column to a number). */
  dateTime: number | undefined
  gradeFk: number | undefined
  notes: string
  type: AscentType
  files: MediaFile[]
}

/** Full ascent shape for the edit form. */
export interface AscentDetail extends RouteAscent {
  humidity: number | undefined
  rating: number | undefined
  regionFk: number
  routeFk: number
  temperature: number | undefined
}
