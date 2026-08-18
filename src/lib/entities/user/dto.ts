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
 *  `!users:id!` token, an event row that is about a person. */
export interface UserRef {
  id: number
  username: string
}

export interface UserSettings {
  gradingScale: GradingScale
  /**
   * The four push switches. They govern push only: the inbox and the feed ignore them.
   *
   * Optional because not every carrier of this type loads them. The `/f/<id>` share page serves a
   * deliberately minimised settings payload (it renders a grade and a temperature and nothing
   * else), and push preferences have no business travelling to a page an anonymous visitor can
   * open. Only the settings screen reads them, and it defaults each to the column's own default.
   */
  notifyAscents?: boolean
  notifyComments?: boolean
  notifyCommunity?: boolean
  notifyCragEdits?: boolean
  notifyDirected?: boolean
  notifyReactions?: boolean
  /** Explicit metric/imperial override; null follows the runtime locale. */
  unitSystem: null | UnitSystem
}
