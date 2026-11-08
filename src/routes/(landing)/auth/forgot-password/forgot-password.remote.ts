import { form, getRequestEvent } from '$app/server'
import { flagContestedSignup } from '$lib/auth/contested.server'
import { mailPasswordReset, mailSignupConfirmation } from '$lib/auth/mail.server'
import { db } from '$lib/db/db.server'
import { botFields } from '$lib/forms/botCheck'
import { screenSubmit } from '$lib/forms/botCheck.server'
import { formError } from '$lib/forms/schemas'
import * as z from '$lib/forms/zod'
import { logServerFailure } from '$lib/logging/failure.server'
import { eq, sql } from 'drizzle-orm'
import { authUsers } from 'drizzle-orm/supabase'

const forgotPasswordSchema = z.object({
  ...botFields,
  email: z.email({ error: formError('form_required') }),
})

/** GoTrue stores addresses lowercased, so a mixed-case entry must still find its account. */
async function findAccount(email: string): Promise<undefined | { confirmed: boolean; id: string }> {
  const [row] = await db
    .select({ confirmedAt: authUsers.emailConfirmedAt, id: authUsers.id })
    .from(authUsers)
    .where(eq(authUsers.email, sql`lower(${email})`))
    .limit(1)
  return row == null ? undefined : { confirmed: row.confirmedAt != null, id: row.id }
}

/** The confirmation, not a reset: confirming a flagged account swaps its password and lands on reset. */
async function resendConfirmation(supabase: App.Locals['supabase'], email: string, authUserId: string) {
  if (!(await flagContestedSignup(authUserId))) return { error: null }
  return mailSignupConfirmation(supabase, email)
}

// Every branch answers alike, so the form cannot tell anyone whether an address has an account.
export const forgotPassword = form(forgotPasswordSchema, async (submitted) => {
  const { email } = submitted
  const account = (await screenSubmit(submitted)) === 'bot' ? undefined : await findAccount(email)
  if (account == null) {
    return { email, success: true }
  }

  const {
    locals: { supabase },
    url,
  } = getRequestEvent()

  const { error } = account.confirmed
    ? await mailPasswordReset(supabase, email, url.origin)
    : await resendConfirmation(supabase, email, account.id)
  if (error != null && error.code !== 'over_email_send_rate_limit') {
    const mail = account.confirmed ? 'reset' : 'confirmation'
    await logServerFailure('forgot-password', `${mail} mail failed: ${error.code ?? error.message}`)
  }

  return { email, success: true }
})
