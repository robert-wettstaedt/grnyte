/** A first ascensionist, optionally linked to a registered user. */
export interface FirstAscensionist {
  id: number
  name: string
  /** Set when this first ascensionist is a registered user. */
  userFk: number | undefined
}
