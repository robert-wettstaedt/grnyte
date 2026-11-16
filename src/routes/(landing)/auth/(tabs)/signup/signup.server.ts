import { getRequestEvent } from '$app/server'
import { SIGNUP_MARKER } from '$lib/auth'
import { verifyCode } from '$lib/auth/codes/codes.server'
import { checkPassword } from '$lib/auth/password/passwordPolicy.server'
import { supabaseAuthServer } from '$lib/auth/server/authServer.server'
import {
  checkResendToken,
  findAccount,
  flagContestedSignup,
  holdCodeSession,
  issueResendToken,
} from '$lib/auth/server/contested.server'
import { gotrueRefusal, noticeAlreadyHasAccount, sendCode } from '$lib/auth/server/mail.server'
import { supabaseAdmin } from '$lib/db/supabaseAdmin.server'
import { screenSubmit } from '$lib/forms/botCheck.server'
import { formError } from '$lib/forms/schemas'

type Refuse = (message: string, field?: 'password') => never

/** The confirmation code from the sign-up mail: the session it opened, held, and the step it leads to. */
export async function confirmSignupCode({ code, email }: { code: string; email: string }) {
  return holdCodeSession(
    await verifyCode(getRequestEvent(), { code, email, kinds: ['signup'], type: 'signup' }),
    'profile',
  )
}

/**
 * A new confirmation code. Without the sign-up's token for this address it may be a stranger's
 * resend, so the account is flagged first and whoever confirms picks a new password.
 */
export async function resendSignupCode(
  submitted: Parameters<typeof screenSubmit>[0] & { email: string; resendToken?: string },
  refuse: (message: string) => never,
) {
  if ((await screenSubmit(submitted)) === 'bot') return { success: true }
  const { email, resendToken } = submitted
  const account = await findAccount(email)
  if (account == null || account.confirmed) return { success: true }
  if (!checkResendToken(email, resendToken) && !(await flagContestedSignup(account.id))) return { success: true }

  await sendCode(supabaseAuthServer(getRequestEvent()), email, { refuse })
  return { success: true }
}

/**
 * The profile (username, grading scale) comes after confirmation, at `/auth/profile`. Every
 * address answers alike, with a resend token, so the answer says nothing about the address.
 */
export async function signUp(
  submitted: Parameters<typeof screenSubmit>[0] & { email: string; password: string },
  refuse: Refuse,
) {
  const { email, password } = submitted
  const answer = { email, resendToken: issueResendToken(email), success: true }
  if ((await screenSubmit(submitted)) === 'bot') return answer
  if ((await checkPassword(password)) === 'breached') refuse(formError('auth_passwordBreached'), 'password')

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
      if (!(await noticeAlreadyHasAccount(account, event.url.origin))) refuse(formError('auth_mailUnavailable'))
      return answer
    }
    // Either password for an unproven address may be a stranger's, so whoever confirms picks a new one.
    if (account != null && !(await flagContestedSignup(account.id))) return answer
    // Resend's per-address limit would show one was mailed a minute ago, which a new address never hits.
    await sendCode(authServer, email, { quietRateLimit: true, refuse })
    return answer
  }
  if (error != null) refuse(await gotrueRefusal(error, 'admin/users'))
  if (data.user == null) refuse(formError('auth_signUpFailed'))

  // A failure here leaves the account in place; a retry takes the email_exists path and resends.
  await sendCode(authServer, email, { refuse })
  return answer
}
