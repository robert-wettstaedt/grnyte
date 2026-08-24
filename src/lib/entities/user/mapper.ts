import { queries } from '$lib/zero/queries'
import type { QueryRow } from '$lib/zero/types'
import type { User, UserListItem, UserRef, UserSettings } from './dto'

export type CurrentUserRow = QueryRow<typeof queries.currentUser>
export type UserListRow = QueryRow<typeof queries.listUsers>
export type UserRefRow = QueryRow<typeof queries.usersByIds>
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

export function toUserRef(row: UserRefRow): UserRef {
  return { id: row.id, username: row.username }
}

export function toUserSettings(row: UserSettingsRow): undefined | UserSettings {
  if (row == null) {
    return undefined
  }

  return {
    gradingScale: row.gradingScale ?? 'FB',
    // The columns carry a DB default, which Zero types as nullable; they never are. Defaulting to
    // true rather than false matches the column, so a settings row that has not synced yet renders
    // the switches the way they will actually be.
    notifyAscents: row.notifyAscents ?? true,
    notifyComments: row.notifyComments ?? true,
    notifyCommunity: row.notifyCommunity ?? true,
    notifyDirected: row.notifyDirected ?? true,
    notifyGuidebookEdits: row.notifyGuidebookEdits ?? true,
    notifyReactions: row.notifyReactions ?? true,
    unitSystem: row.unitSystem ?? null,
  }
}
