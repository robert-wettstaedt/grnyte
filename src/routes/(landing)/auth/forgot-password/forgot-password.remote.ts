import { command, form, getRequestEvent } from '$app/server'
import { supabaseAuthServer, type AuthServer } from '$lib/auth/authServer.server'
import { clearCodeTries } from '$lib/auth/codeAttempts.server'
import { verifyCode } from '$lib/auth/codes.server'
import { contestedNext, findAccount, flagContestedSignup } from '$lib/auth/contested.server'
import { gotrueRefusal, mailPasswordReset, mailSignupConfirmation } from '$lib/auth/mail.server'
import { botFields } from '$lib/forms/botCheck'
import { screenSubmit } from '$lib/forms/botCheck.server'
import { formError } from '$lib/forms/schemas'
import * as z from '$lib/forms/zod'
import { refuseCommand } from '$lib/remote/authed.server'
import { invalid } from '@sveltejs/kit'

const forgotPasswordSchema = z.object({
  ...botFields,
  email: z.email({ error: formError('form_required') }),
})

const codeSchema = z.object({
  code: z.string({ error: formError('form_required') }),
  email: z.email({ error: formError('form_required') }),
})

/** The confirmation, not a reset: confirming a flagged account swaps its password and lands on reset. */
async function resendConfirmation(authServer: AuthServer, email: string, authUserId: string) {
  if (!(await flagContestedSignup(authUserId))) return { error: null }
  return mailSignupConfirmation(authServer, email)
}

// Every branch answers alike, so the form cannot tell anyone whether an address has an account.
export const forgotPassword = form(forgotPasswordSchema, async (submitted) => {
  const { email } = submitted
  const account = (await screenSubmit(submitted)) === 'bot' ? undefined : await findAccount(email)
  if (account == null) {
    return { email, success: true }
  }

  const authServer = supabaseAuthServer(getRequestEvent())
  const { error } = account.confirmed
    ? await mailPasswordReset(authServer, email)
    : await resendConfirmation(authServer, email, account.id)
  if (error != null) invalid(await gotrueRefusal(error, account.confirmed ? 'recover' : 'resend'))

  // A new code resets the guesses at it; an unconfirmed address's code is a confirmation code.
  await clearCodeTries(email, 'recovery')
  if (!account.confirmed) await clearCodeTries(email, 'signup')
  return { email, success: true }
})

/**
 * The mailed code, whichever GoTrue sent: type `email` matches a confirmation and a recovery code
 * alike. Only an unconfirmed address's tries also count against its sign-up code.
 */
export const confirmResetCode = command(codeSchema, async ({ code, email }) => {
  const event = getRequestEvent()
  const account = await findAccount(email)
  const kinds = account?.confirmed === false ? (['recovery', 'signup'] as const) : (['recovery'] as const)
  const { session, user } = await verifyCode(event, { code, email, kinds: [...kinds], type: 'email' })
  if (session == null || user == null) return refuseCommand(formError('auth_unexpectedError'), 'code')
  await event.locals.supabase.auth.setSession(session)
  return { next: (await contestedNext(event.locals.supabase, user)) ?? ('choosePassword' as const) }
})
