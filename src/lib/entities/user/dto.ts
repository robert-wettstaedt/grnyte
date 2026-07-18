export type GradingScale = 'FB' | 'V'

export interface User {
  id: number
  username: string
  userSettings: undefined | UserSettings
}

export interface UserSettings {
  gradingScale: GradingScale
  notifyModerations: boolean
  notifyNewAscents: boolean
  notifyNewUsers: boolean
}
