/** A first ascensionist, optionally linked to a registered user. */
export interface FirstAscensionist {
  id: number
  name: string
  /** Set when this first ascensionist is a registered user. */
  userFk: number | undefined
  /** The linked user's username, when {@link userFk} is set. */
  username: string | undefined
}

/**
 * One climber for a picker, collapsed across regions: first ascensionists are
 * region-scoped, so the same person has a row per region.
 */
export interface FirstAscensionistGroup {
  /** Every row id this climber owns, selected and cleared together. */
  ids: number[]
  name: string
  /** Set when any of the rows is linked to a registered user. */
  userFk: number | undefined
}
