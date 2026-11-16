import { resolve } from '$app/paths'
import { command, form, getRequestEvent, query } from '$app/server'
import { holdGrant, reauthCaller, spendGrant } from '$lib/auth/reauth.server'
import { pinnedTx } from '$lib/db/pinned.server'
import { deleteAccount, previewAccountDeletion } from '$lib/entities/user/delete.server'
import { authError, formError } from '$lib/forms/schemas'
import { refuseCommand, refuseVia, requireAuthed, requireVerifiedEmail } from '$lib/remote/authed.server'
import type { AuthError } from '@supabase/supabase-js'
import { error } from '@sveltejs/kit'
import { deleteAccountSchema, updateEmailSchema, updatePasswordSchema } from './schemas'

/**
 * Start an email change. No password prompt here: Supabase's secure email change mails a link to
 * both the current and the new address and applies the change only once both are opened, so a
 * stolen session can't complete it without the old inbox either way.
 */
async function changeEmail(email: string, refuse: (message: string, field?: 'email') => never) {
  const {
    locals: { claims, supabase },
    url,
  } = getRequestEvent()

  // `claims`, deliberately not `requireAuthed`: that also demands a `public.users` row, and an
  // account whose sign-up half-completed must still be able to fix its address.
  if (claims == null) {
    error(401, formError('auth_notSignedIn'))
  }

  // Supabase accepts the current address without error and sends nothing, so the screen would claim a link.
  if (email.trim().toLowerCase() === claims.email?.toLowerCase()) {
    refuse(formError('settings_emailUnchanged'), 'email')
  }

  const { error: updateError } = await supabase.auth.updateUser(
    { email },
    { emailRedirectTo: `${url.origin}/auth/confirm?next=/settings` },
  )

  if (updateError != null) {
    refuse(authError(updateError))
  }

  return { email, success: true }
}

/** @public Unused since the store forms; deployed one more release for tabs loaded before them. */
export const updateEmail = form(updateEmailSchema, ({ email }, issue) => changeEmail(email, refuseVia(issue)))

export const updateEmailCommand = command(updateEmailSchema, ({ email }) => changeEmail(email, refuseCommand))

/**
 * Change the password. Unlike the email change there is no second inbox in the loop, so the current
 * password is the only thing standing between a stolen session and a permanent account takeover.
 */
async function changePassword(
  { currentPassword, password }: { currentPassword?: string; password: string },
  refuse: (message: string, field?: 'code') => never,
) {
  // Only a tab from before re-authentication sends the current password.
  if (currentPassword !== undefined) refuse(formError('auth_reloadPage'))

  const {
    locals: { claims, supabase },
  } = getRequestEvent()

  // `claims`, not `requireAuthed`, for the same reason as `updateEmail` above.
  if (claims == null) {
    error(401, formError('auth_notSignedIn'))
  }
  const caller = reauthCaller()

  // The grant is held across the GoTrue call and spent only once it succeeded, so a refusal keeps it.
  // shortcut: no timeout and the session's own `updateUser`; task 8.4a/8.4c move this to the admin API.
  const refused = await pinnedTx(async (tx) => {
    if (!(await holdGrant(tx, caller, 'password.change', caller.authUserId))) return 'reauthRequired' as const
    // Supabase rejects a password it considers unchanged or too weak; `authError` maps those codes.
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError != null) throw updateError
    await spendGrant(tx, caller, 'password.change', caller.authUserId)
    return null
  }).catch((updateError: AuthError) => updateError)

  if (refused === 'reauthRequired') refuse(formError('auth_reauthRequired'), 'code')
  if (refused != null) refuse(authError(refused))

  return { redirectTo: resolve('/(app)/settings'), success: true }
}

/** @public Unused since the store forms; deployed one more release for tabs loaded before them. */
export const updatePassword = form(updatePasswordSchema, (value, issue) =>
  changePassword(value, (message) => refuseVia(issue)(message)),
)

export const updatePasswordCommand = command(updatePasswordSchema, (value) => changePassword(value, refuseCommand))

/** Delete the caller's own account. */
export const deleteAccountCommand = command(deleteAccountSchema, async ({ password }) => {
  // Only a tab from before re-authentication sends a password.
  if (password !== undefined) refuseCommand(formError('auth_reloadPage'))
  const { email, user } = requireVerifiedEmail()
  const result = await deleteAccount({ authUserFk: user.authUserFk, email, id: user.id }, reauthCaller())

  if (result.kind === 'reauthRequired') {
    refuseCommand(formError('auth_reauthRequired'), 'code')
  }
  if (result.kind === 'blocked') {
    refuseCommand(formError('settings_deleteAccountBlocked', { regions: result.regions.join(', ') }))
  }

  // Clears this browser's session cookies; GoTrue revoked every other session with the account.
  await getRequestEvent().locals.supabase.auth.signOut({ scope: 'local' })
})

/** What deleting the caller's account would do to their regions, for the screen's warnings. A
 *  server read, so it is the same rule the deletion applies and never a half-synced member list. */
export const accountDeletionPreview = query(async () => {
  const { user } = requireAuthed()
  return previewAccountDeletion(user.id)
})
