import { resolve } from '$app/paths'
import { command, form, getRequestEvent } from '$app/server'
import { verifyPassword } from '$lib/entities/user/password.server'
import { authError, formError } from '$lib/forms/schemas'
import { refuseVia } from '$lib/remote/authed.server'
import { error } from '@sveltejs/kit'
import { updateEmailSchema, updatePasswordSchema } from './schemas'

/** A refusal as a command raises it: the field rides in the `HttpError` body for the store form. */
const refuseCommand = (message: string, field?: string): never => error(400, { field, message })

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
  { currentPassword, password }: { currentPassword: string; password: string },
  refuse: (message: string, field?: 'currentPassword') => never,
) {
  const {
    locals: { claims, supabase },
  } = getRequestEvent()

  // The address comes from the verified token, never from `session.user.email`. That field is
  // lifted verbatim out of the unsigned cookie, so it used to be attacker-chosen: signing in with
  // your own account and rewriting it to a victim's address turned the check below, which reports
  // whether a password is correct, into a guessing oracle against any account in the project.
  // `claims`, not `requireAuthed`, for the same reason as `updateEmail` above.
  if (claims?.email == null) {
    error(401, formError('auth_notSignedIn'))
  }

  if (!(await verifyPassword(claims.email, currentPassword))) {
    refuse(formError('settings_passwordIncorrect'), 'currentPassword')
  }

  // Supabase rejects a password it considers unchanged or too weak; `authError` maps those codes
  // onto our copy so the rules the server owns still read in the user's language.
  const { error: updateError } = await supabase.auth.updateUser({ password })

  if (updateError != null) {
    refuse(authError(updateError))
  }

  return { redirectTo: resolve('/(app)/settings'), success: true }
}

/** @public Unused since the store forms; deployed one more release for tabs loaded before them. */
export const updatePassword = form(updatePasswordSchema, (value, issue) => changePassword(value, refuseVia(issue)))

export const updatePasswordCommand = command(updatePasswordSchema, (value) => changePassword(value, refuseCommand))
