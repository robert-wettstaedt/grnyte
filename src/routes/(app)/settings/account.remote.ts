import { resolve } from '$app/paths'
import { command, form, getRequestEvent, query } from '$app/server'
import { refuseCommand, refuseVia } from '$lib/remote/authed.server'
import * as body from './account.server'
import { deleteAccountSchema, emailChangeCodeSchema, updateEmailSchema, updatePasswordSchema } from './schemas'

/** @public Unused since the store forms; deployed one more release for tabs loaded before them. */
export const updateEmail = form(updateEmailSchema, ({ email }, issue) => body.changeEmail(email, refuseVia(issue)))

export const updateEmailCommand = command(updateEmailSchema, ({ email }) => body.changeEmail(email, refuseCommand))

export const confirmEmailChangeCode = command(emailChangeCodeSchema, (input) =>
  body.confirmEmailChangeCode(input, { refresh: true }),
)

async function changePassword(
  value: { currentPassword?: string; password: string },
  refuse: (message: string, field?: 'code' | 'password') => never,
) {
  const session = await body.changePassword(value, refuse)
  await getRequestEvent().locals.supabase.auth.setSession(session)
  const { access_token, refresh_token } = session
  return { redirectTo: resolve('/(app)/settings'), session: { access_token, refresh_token }, success: true }
}

/** @public Unused since the store forms; deployed one more release for tabs loaded before them. */
export const updatePassword = form(updatePasswordSchema, (value, issue) =>
  changePassword(value, (message) => refuseVia(issue)(message)),
)

export const updatePasswordCommand = command(updatePasswordSchema, (value) => changePassword(value, refuseCommand))

/** Delete the caller's own account. */
export const deleteAccountCommand = command(deleteAccountSchema, async (value) => {
  await body.deleteOwnAccount(value)
  // Clears this browser's session cookies; GoTrue revoked every other session with the account.
  await getRequestEvent().locals.supabase.auth.signOut({ scope: 'local' })
})

/** What deleting the caller's account would do to their regions, for the screen's warnings. A
 *  server read, so it is the same rule the deletion applies and never a half-synced member list. */
export const accountDeletionPreview = query(body.accountDeletionPreview)
