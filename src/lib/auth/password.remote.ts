import { command, getRequestEvent } from '$app/server'
import { isFreshCodeSession } from '$lib/auth'
import { gotrueRefusal } from '$lib/auth/mail.server'
import { checkPassword } from '$lib/auth/passwordPolicy.server'
import { voidReauth } from '$lib/auth/reauth.server'
import { formError, passwordSchema } from '$lib/forms/schemas'
import * as z from '$lib/forms/zod'
import { refuseCommand } from '$lib/remote/authed.server'
import { error } from '@sveltejs/kit'

/** The new password after a reset or a contested confirmation; every other session of the account ends. */
export const setNewPassword = command(z.object({ password: passwordSchema }), async ({ password }) => {
  const { locals } = getRequestEvent()
  if (locals.claims == null) error(401, formError('auth_notSignedIn'))
  // A grant would need the current password; a code just verified on this session stands in for it.
  if (!isFreshCodeSession(locals.claims)) refuseCommand(formError('auth_codeExpired'))
  if ((await checkPassword(password)) === 'breached') refuseCommand(formError('auth_passwordBreached'), 'password')

  const { error: updateError } = await locals.supabase.auth.updateUser({ password })
  if (updateError != null) refuseCommand(await gotrueRefusal(updateError, 'user'), 'password')
  await voidReauth(locals.claims.sub)
  await locals.supabase.auth.signOut({ scope: 'others' })
  return { done: true }
})
