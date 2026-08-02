export type GradingScale = 'FB' | 'V'
export type UnitSystem = 'imperial' | 'metric'

export interface User {
  id: number
  username: string
  userSettings: undefined | UserSettings
}

/** A user surfaced by search: the display name plus the regions it shares with
 *  the searcher (for a region breadcrumb). */
export interface UserListItem extends UserRef {
  regionFks: number[]
}

/** A user reduced to what naming and linking to one needs: the profile header, a
 *  `!users:id!` token, an activity row that is about a person. */
export interface UserRef {
  id: number
  username: string
}

export interface UserSettings {
  gradingScale: GradingScale
  notifyModerations: boolean
  notifyNewAscents: boolean
  notifyNewUsers: boolean
  /** Explicit metric/imperial override; null follows the runtime locale. */
  unitSystem: null | UnitSystem
}
