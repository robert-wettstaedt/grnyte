import { command, form, getRequestEvent } from '$app/server'
import { SIGNUP_MARKER } from '$lib/auth'
import { supabaseAuthServer, type AuthServer } from '$lib/auth/authServer.server'
import { clearCodeTries } from '$lib/auth/codeAttempts.server'
import { verifyCode } from '$lib/auth/codes.server'
import {
  checkResendToken,
  contestedNext,
  findAccount,
  flagContestedSignup,
  issueResendToken,
} from '$lib/auth/contested.server'
import { gotrueRefusal, mailSignupConfirmation, noticeAlreadyHasAccount } from '$lib/auth/mail.server'
import { checkPassword } from '$lib/auth/passwordPolicy.server'
import { supabaseAdmin } from '$lib/db/supabaseAdmin.server'
import { botFields } from '$lib/forms/botCheck'
import { screenSubmit } from '$lib/forms/botCheck.server'
import { formError, passwordSchema, passwordsMatch } from '$lib/forms/schemas'
import * as z from '$lib/forms/zod'
import { refuseCommand } from '$lib/remote/authed.server'
import { invalid } from '@sveltejs/kit'

const signUpSchema = z
  .object({
    ...botFields,
    confirmPassword: z.string({ error: formError('form_required') }),
    email: z.email({ error: formError('form_required') }),
    password: passwordSchema,
  })
  .check(passwordsMatch)

const codeSchema = z.object({
  code: z.string({ error: formError('form_required') }),
  email: z.email({ error: formError('form_required') }),
})

const resendSchema = z.object({
  ...botFields,
  email: z.email({ error: formError('form_required') }),
  resendToken: z.optional(z.string()),
})

// The profile (username, grading scale) comes after confirmation, at `/auth/profile`. Every
// address answers alike, with a resend token, so the answer says nothing about the address.
export const signUp = form(signUpSchema, async (submitted, issue) => {
  const { email, password } = submitted
  const answer = { email, resendToken: issueResendToken(email), success: true }
  if ((await screenSubmit(submitted)) === 'bot') return answer
  if ((await checkPassword(password)) === 'breached') invalid(issue.password(formError('auth_passwordBreached')))

  const event = getRequestEvent()
  const authServer = supabaseAuthServer(event)

  // The hook refuses a public sign-up, so the published key cannot skip the checks above.
  const { data, error } = await supabaseAdmin().auth.admin.createUser({
    app_metadata: SIGNUP_MARKER,
    email,
    email_confirm: false,
    password,
  })
  if (error?.code === 'email_exists') {
    const account = await findAccount(email)
    if (account?.confirmed === true) {
      if (!(await noticeAlreadyHasAccount(account, event.url.origin))) invalid(formError('auth_mailUnavailable'))
      return answer
    }
    // Either password for an unproven address may be a stranger's, so whoever confirms picks a new one.
    if (account != null && !(await flagContestedSignup(account.id))) return answer
    // Resend's per-address limit would show one was mailed a minute ago, which a new address never hits.
    await sendCode(authServer, email, { quietRateLimit: true })
    return answer
  }
  if (error != null) invalid(await gotrueRefusal(error, 'admin/users'))
  if (data.user == null) invalid(formError('auth_signUpFailed'))

  // A failure here leaves the account in place; a retry takes the email_exists path and resends.
  await sendCode(authServer, email)
  return answer
})

/** The 8-digit confirmation code from the sign-up mail. */
export const confirmSignupCode = command(codeSchema, async ({ code, email }) => {
  const event = getRequestEvent()
  const { session, user } = await verifyCode(event, { code, email, kinds: ['signup'], type: 'signup' })
  if (session == null || user == null) return refuseCommand(formError('auth_unexpectedError'), 'code')
  await event.locals.supabase.auth.setSession(session)
  return { next: (await contestedNext(event.locals.supabase, user)) ?? ('profile' as const) }
})

/**
 * A new confirmation code. Without the sign-up's token for this address it may be a stranger's
 * resend, so the account is flagged first and whoever confirms picks a new password.
 */
export const resendSignupCode = form(resendSchema, async (submitted) => {
  if ((await screenSubmit(submitted)) === 'bot') return { success: true }
  const { email, resendToken } = submitted
  const account = await findAccount(email)
  if (account == null || account.confirmed) return { success: true }
  if (!checkResendToken(email, resendToken) && !(await flagContestedSignup(account.id))) return { success: true }

  await sendCode(supabaseAuthServer(getRequestEvent()), email)
  return { success: true }
})

/** The admin API creates without mailing; GoTrue renders and sends the code. A sent code resets the guesses. */
async function sendCode(authServer: AuthServer, email: string, { quietRateLimit = false } = {}): Promise<void> {
  const { error } = await mailSignupConfirmation(authServer, email)
  if (error == null) {
    await clearCodeTries(email, 'signup')
    return
  }
  if (quietRateLimit && error.code === 'over_email_send_rate_limit') return
  invalid(await gotrueRefusal(error, 'resend'))
}
