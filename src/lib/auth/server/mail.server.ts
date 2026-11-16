import { clearCodeTries, countTry } from '$lib/auth/codes/codeAttempts.server'
import { signInMethods } from '$lib/auth/methods/methods.server'
import type { AuthServer } from '$lib/auth/server/authServer.server'
import { noteMailRefusal } from '$lib/auth/server/events.server'
import { pinnedTx } from '$lib/db/pinned.server'
import { userSettings } from '$lib/db/schema'
import { alreadyHasAccount, appleRemoved, passwordChanged } from '$lib/email/account'
import { sendEmail } from '$lib/email/send.server'
import { authError, formError, type FormMessage } from '$lib/forms/schemas'
import { contactLocale } from '$lib/i18n/message'
import { logServerFailure } from '$lib/logging/failure.server'
import type { AuthError } from '@supabase/supabase-js'
import { invalid } from '@sveltejs/kit'
import { eq } from 'drizzle-orm'

export const mailPasswordReset = (authServer: AuthServer, email: string) => authServer.resetPasswordForEmail(email)

export const mailSignupConfirmation = (authServer: AuthServer, email: string) =>
  authServer.resend({ email, type: 'signup' })

/**
 * A GoTrue refusal on a send or a code step, as the person sees it. Every 429
 * is logged with one stable message per endpoint; the send limit also counts as a mail refusal.
 */
export async function gotrueRefusal(error: AuthError, endpoint: string): Promise<FormMessage> {
  if (error.status === 429) await logServerFailure('auth', `GoTrue rate limit hit (${endpoint})`)
  // The per-address wait between sends shares the send limit's code; only its message tells them apart.
  if (/only request this after \d+ seconds/.test(error.message)) return formError('auth_rateLimited')
  if (error.code === 'over_email_send_rate_limit') {
    await noteMailRefusal(error)
    return formError('auth_mailUnavailable')
  }
  if (error.status === 429) return formError('auth_tooManyTries')
  if (error.code === 'signup_disabled' || error.message === 'Signup is not allowed') {
    return formError('auth_signupRefused')
  }
  // No status: GoTrue never answered.
  if (error.status == null || error.status === 0 || error.status >= 500) return formError('auth_serviceUnavailable')
  return authError(error)
}

/**
 * Tells the owner of a taken address that somebody tried it, at most once a minute per address.
 * False only when the mail could not be sent.
 */
export async function noticeAlreadyHasAccount(
  account: { email: string; id: string },
  origin: string,
): Promise<boolean> {
  const tries = await pinnedTx((tx) => countTry(tx, account.email.toLowerCase(), 'already_has_account'))
  if (tries > 1) return true

  const { locale, methods } = await recipient(account.id)
  return sendEmail({
    ...alreadyHasAccount({ forgotPasswordUrl: `${origin}/auth/forgot-password`, locale, methods }),
    locale,
    template: 'already-has-account',
    to: account.email,
  })
}

/** GoTrue sends no identity-unlinked notice for the Apple notification's own delete, so grnyte does. */
export async function noticeAppleRemoved(account: { email: string; id: string }): Promise<boolean> {
  const { locale, methods } = await recipient(account.id)
  return sendEmail({ ...appleRemoved({ locale, methods }), locale, template: 'apple-removed', to: account.email })
}

/** GoTrue's admin update sends no password-changed notice (v2.197.0), so grnyte does. */
export async function noticePasswordChanged(account: { email: string; id: string }): Promise<boolean> {
  const { locale, methods } = await recipient(account.id)
  return sendEmail({ ...passwordChanged({ locale, methods }), locale, template: 'password-changed', to: account.email })
}

/** Mails a sign-up code (the admin API creates without mailing; GoTrue renders it). A sent code resets the guesses. */
export async function sendCode(
  authServer: AuthServer,
  email: string,
  { quietRateLimit = false, refuse = invalid }: { quietRateLimit?: boolean; refuse?: (message: string) => never } = {},
): Promise<void> {
  const { error } = await mailSignupConfirmation(authServer, email)
  if (error == null) {
    await clearCodeTries(email, ['signup'])
    return
  }
  if (quietRateLimit && error.code === 'over_email_send_rate_limit') return
  refuse(await gotrueRefusal(error, 'resend'))
}

async function recipient(authUserId: string) {
  const [settings] = await pinnedTx((tx) =>
    tx
      .select({ locale: userSettings.contactLocale })
      .from(userSettings)
      .where(eq(userSettings.authUserFk, authUserId))
      .limit(1),
  )
  return { locale: contactLocale(settings?.locale), methods: await signInMethods(authUserId) }
}
