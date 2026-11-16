import { resolve } from '$app/paths'
import { command, form, getRequestEvent, query } from '$app/server'
import { supabaseAuthServer, supabaseAuthServerAs } from '$lib/auth/authServer.server'
import { clearCodeTries } from '$lib/auth/codeAttempts.server'
import { verifyCode } from '$lib/auth/codes.server'
import { findAccount } from '$lib/auth/contested.server'
import { gotrueRefusal, noticeAlreadyHasAccount, noticePasswordChanged } from '$lib/auth/mail.server'
import { addEmailIdentity } from '$lib/auth/methods.server'
import { checkPassword } from '$lib/auth/passwordPolicy.server'
import { holdGrant, reauthCaller, spendGrant, voidReauth, voidReauthCodes } from '$lib/auth/reauth.server'
import { requireLiveSession } from '$lib/auth/session.server'
import { pinnedTx } from '$lib/db/pinned.server'
import { supabaseAdmin } from '$lib/db/supabaseAdmin.server'
import { deleteAccount, previewAccountDeletion } from '$lib/entities/user/delete.server'
import { formError } from '$lib/forms/schemas'
import { refuseCommand, refuseVia, requireAuthed, requireVerifiedEmail } from '$lib/remote/authed.server'
import type { AuthError } from '@supabase/supabase-js'
import { error } from '@sveltejs/kit'
import { deleteAccountSchema, emailChangeCodeSchema, updateEmailSchema, updatePasswordSchema } from './schemas'

/**
 * Start an email change. No password prompt here: GoTrue's secure email change mails a code to
 * both addresses and applies the change only once both are entered (`confirmEmailChangeCode`).
 * A taken address gets a notice instead and the answer reads the same.
 */
async function changeEmail(email: string, refuse: (message: string, field?: 'email') => never) {
  await requireLiveSession()
  const event = getRequestEvent()
  const { claims, verifiedToken } = event.locals

  // `claims`, deliberately not `requireAuthed`: that also demands a `public.users` row, and an
  // account whose sign-up half-completed must still be able to fix its address.
  if (claims == null || verifiedToken == null) {
    error(401, formError('auth_notSignedIn'))
  }

  // GoTrue accepts the current address without error and sends nothing, so the screen would claim a code.
  if (email.trim().toLowerCase() === claims.email?.toLowerCase()) {
    refuse(formError('settings_emailUnchanged'), 'email')
  }

  const answer = { current: claims.email ?? '', email, success: true }
  const taken = await findAccount(email)
  if (taken != null) {
    if (!(await noticeAlreadyHasAccount(taken, event.url.origin))) refuse(formError('auth_mailUnavailable'))
    return answer
  }

  const { error: updateError } = await supabaseAuthServerAs(event, verifiedToken).updateUser({ email })
  if (updateError != null) refuse(await gotrueRefusal(updateError, 'user'))
  // GoTrue minted new codes for both addresses.
  for (const address of [answer.current, email]) await clearCodeTries(address, ['email_change'])
  return answer
}

/** @public Unused since the store forms; deployed one more release for tabs loaded before them. */
export const updateEmail = form(updateEmailSchema, ({ email }, issue) => changeEmail(email, refuseVia(issue)))

export const updateEmailCommand = command(updateEmailSchema, ({ email }) => changeEmail(email, refuseCommand))

/**
 * One of the two email change codes. `next` while GoTrue waits for the other address (it answers
 * a single confirmation without a session); `done` once the address changed.
 */
export const confirmEmailChangeCode = command(emailChangeCodeSchema, async ({ code, email }) => {
  const claims = await requireLiveSession()
  const event = getRequestEvent()
  const { supabase } = event.locals

  const { session, user } = await verifyCode(event, { code, email, kinds: ['email_change'], type: 'email_change' })
  if (session == null || user?.email?.toLowerCase() === claims.email?.toLowerCase()) return { step: 'next' as const }

  await voidReauth(claims.sub)
  await supabase.auth.setSession(session)
  await supabase.auth.signOut({ scope: 'others' })
  return { step: 'done' as const }
})

const ADMIN_TIMEOUT_MS = 5000

/**
 * Change or set the password, after a confirmation. The admin API needs no
 * nonce however old the session is; it ends every session, so this device signs back in.
 */
async function changePassword(
  { currentPassword, password }: { currentPassword?: string; password: string },
  refuse: (message: string, field?: 'code' | 'password') => never,
) {
  // Only a tab from before re-authentication sends the current password.
  if (currentPassword !== undefined) refuse(formError('auth_reloadPage'))

  const event = getRequestEvent()
  const { claims, supabase } = event.locals

  // `claims`, not `requireAuthed`, for the same reason as `updateEmail` above.
  if (claims?.email == null) {
    error(401, formError('auth_notSignedIn'))
  }
  if ((await checkPassword(password)) === 'breached') refuse(formError('auth_passwordBreached'), 'password')
  const caller = await reauthCaller()

  // The grant is held across the GoTrue call and spent only once it succeeded, so a refusal keeps it.
  // The call holds a pooled connection across HTTP, hence the timeout.
  const refused = await pinnedTx(async (tx) => {
    if (!(await holdGrant(tx, caller, 'password.change', caller.authUserId))) return 'reauthRequired' as const
    const { error: updateError } = await supabaseAdmin({ timeoutMs: ADMIN_TIMEOUT_MS }).auth.admin.updateUserById(
      caller.authUserId,
      { password },
    )
    if (updateError != null) throw updateError
    await spendGrant(tx, caller, 'password.change', caller.authUserId)
    return null
  }).catch((updateError: AuthError) => updateError)

  if (refused === 'reauthRequired') refuse(formError('auth_reauthRequired'), 'code')
  if (refused != null) {
    // A refusal or a timeout may still have changed the password at GoTrue.
    await voidReauthCodes(caller.authUserId)
    refuse(await gotrueRefusal(refused, 'admin/users'))
  }
  await addEmailIdentity(caller.authUserId)
  await voidReauth(caller.authUserId)
  // The change stands either way; a failed send is logged by `sendEmail`.
  await noticePasswordChanged({ email: claims.email, id: caller.authUserId })

  // The admin update ended this device's session too: sign back in and hand the page the new one.
  const { data, error: signInError } = await supabaseAuthServer(event).signInWithPassword({
    email: claims.email,
    password,
  })
  if (signInError != null || data.session == null) refuse(formError('auth_passwordUpdatedBody'))
  await supabase.auth.setSession(data.session)
  const { access_token, refresh_token } = data.session
  return { redirectTo: resolve('/(app)/settings'), session: { access_token, refresh_token }, success: true }
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
  const result = await deleteAccount({ authUserFk: user.authUserFk, email, id: user.id }, await reauthCaller())

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
  await requireLiveSession()
  const { user } = requireAuthed()
  return previewAccountDeletion(user.id)
})
