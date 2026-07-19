export type GradingScale = 'FB' | 'V'

export interface User {
  id: number
  username: string
  userSettings: undefined | UserSettings
}

/** A user surfaced by search: the display name plus the regions it shares with
 *  the searcher (for a region breadcrumb). */
export interface UserListItem {
  id: number
  regionFks: number[]
  username: string
}

export interface UserSettings {
  gradingScale: GradingScale
  notifyModerations: boolean
  notifyNewAscents: boolean
  notifyNewUsers: boolean
}
