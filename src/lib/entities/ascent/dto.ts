export type AscentType = 'flash' | 'send' | 'repeat' | 'attempt'

/** Minimal ascent shape used to derive a user's tick status per route. */
export interface UserAscent {
  routeFk: number
  type: AscentType
}
