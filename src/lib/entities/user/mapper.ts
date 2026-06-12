import { queries } from '$lib/zero/queries'
import type { QueryRow } from '$lib/zero/types'
import type { User, UserSettings } from './dto'

export type CurrentUserRow = QueryRow<typeof queries.currentUser>
type UserSettingsRow = CurrentUserRow['userSettings']

export function toUserSettings(row: UserSettingsRow): UserSettings | undefined {
  if (row == null) {
    return undefined
  }

  return {
    gradingScale: row.gradingScale ?? 'FB',
    notifyModerations: row.notifyModerations ?? false,
    notifyNewAscents: row.notifyNewAscents ?? false,
    notifyNewUsers: row.notifyNewUsers ?? false,
  }
}

export function toUser(row: CurrentUserRow): User {
  return {
    id: row.id,
    username: row.username,
    userSettings: toUserSettings(row.userSettings),
  }
}
