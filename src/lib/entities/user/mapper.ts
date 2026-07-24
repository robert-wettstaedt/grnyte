import { queries } from '$lib/zero/queries'
import type { QueryRow } from '$lib/zero/types'
import type { User, UserListItem, UserSettings } from './dto'

export type CurrentUserRow = QueryRow<typeof queries.currentUser>
export type UserListRow = QueryRow<typeof queries.listUsers>
type UserSettingsRow = CurrentUserRow['userSettings']

export function toUser(row: CurrentUserRow): User {
  return {
    id: row.id,
    username: row.username,
    userSettings: toUserSettings(row.userSettings),
  }
}

export function toUserListItem(row: UserListRow): UserListItem {
  return {
    id: row.id,
    regionFks: (row.regionMemberships ?? []).map((membership) => membership.regionFk),
    username: row.username,
  }
}

export function toUserSettings(row: UserSettingsRow): undefined | UserSettings {
  if (row == null) {
    return undefined
  }

  return {
    gradingScale: row.gradingScale ?? 'FB',
    notifyModerations: row.notifyModerations ?? false,
    notifyNewAscents: row.notifyNewAscents ?? false,
    notifyNewUsers: row.notifyNewUsers ?? false,
    unitSystem: row.unitSystem ?? null,
  }
}
