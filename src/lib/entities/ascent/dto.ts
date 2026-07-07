import type { MediaFile } from '$lib/entities/file/dto'

export type AscentType = 'flash' | 'send' | 'repeat' | 'attempt'

/** Minimal ascent shape used to derive a user's tick status per route. */
export interface UserAscent {
  routeFk: number
  type: AscentType
}

/** One ascent of a route: the climber's grade opinion and any attached media. */
export interface RouteAscent {
  id: number
  gradeFk: number | undefined
  files: MediaFile[]
}
