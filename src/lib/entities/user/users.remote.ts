import { authedCommand, authedForm, refuseVia } from '$lib/remote/authed.server'
import { updateUsernameSchema, userSettingsSchema } from './dto'
import { updateUsernameRow, updateUserSettingsRow } from './profile.server'

// The bodies live in `profile.server.ts`, shared with the user mutators; these stay one release so
// tabs loaded before the mutators keep their endpoints.

/** @public Unused since the mutators; deployed one more release for tabs loaded before them. */
export const updateUsername = authedForm(updateUsernameSchema, (value, ctx, issue) =>
  updateUsernameRow(value, ctx, refuseVia(issue)),
)

/** @public Unused since the mutators; deployed one more release for tabs loaded before them. */
export const updateUserSettings = authedCommand(userSettingsSchema, (values, ctx) => updateUserSettingsRow(values, ctx))
