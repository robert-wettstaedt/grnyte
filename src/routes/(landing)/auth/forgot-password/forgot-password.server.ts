import { getRequestEvent } from '$app/server'
import { supabaseAuthServer, type AuthServer } from '$lib/auth/authServer.server'
import { clearCodeTries } from '$lib/auth/codeAttempts.server'
import { verifyCode } from '$lib/auth/codes.server'
import { findAccount, flagContestedSignup } from '$lib/auth/contested.server'
import { gotrueRefusal, mailPasswordReset, mailSignupConfirmation } from '$lib/auth/mail.server'
import { screenSubmit } from '$lib/forms/botCheck.server'

/**
 * The mailed code, whichever GoTrue sent: type `email` matches a confirmation and a recovery code
 * alike. Only an unconfirmed address's tries also count against its sign-up code.
 */
export async function confirmResetCode({ code, email }: { code: string; email: string }) {
  const account = await findAccount(email)
  const kinds = account?.confirmed === false ? (['recovery', 'signup'] as const) : (['recovery'] as const)
  return verifyCode(getRequestEvent(), { code, email, kinds: [...kinds], type: 'email' })
}

/** Every branch answers alike, so the answer cannot tell anyone whether an address has an account. */
export async function forgotPassword(
  submitted: Parameters<typeof screenSubmit>[0] & { email: string },
  refuse: (message: string) => never,
) {
  const { email } = submitted
  const account = (await screenSubmit(submitted)) === 'bot' ? undefined : await findAccount(email)
  if (account == null) {
    return { email, success: true }
  }

  const authServer = supabaseAuthServer(getRequestEvent())
  const sent = account.confirmed
    ? await mailPasswordReset(authServer, email)
    : await resendConfirmation(authServer, email, account.id)
  if (sent == null) return { email, success: true }
  if (sent.error != null) refuse(await gotrueRefusal(sent.error, account.confirmed ? 'recover' : 'resend'))

  // A new code resets the guesses at it; an unconfirmed address's code is a confirmation code.
  await clearCodeTries(email, account.confirmed ? ['recovery'] : ['recovery', 'signup'])
  return { email, success: true }
}

/** The confirmation, not a reset: confirming a flagged account swaps its password and lands on reset. Null when nothing was sent. */
async function resendConfirmation(authServer: AuthServer, email: string, authUserId: string) {
  if (!(await flagContestedSignup(authUserId))) return null
  return mailSignupConfirmation(authServer, email)
}
