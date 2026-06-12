export type GradingScale = 'FB' | 'V'

export interface UserSettings {
  gradingScale: GradingScale
  notifyModerations: boolean
  notifyNewAscents: boolean
  notifyNewUsers: boolean
}

export interface User {
  id: number
  username: string
  userSettings: UserSettings | undefined
}
