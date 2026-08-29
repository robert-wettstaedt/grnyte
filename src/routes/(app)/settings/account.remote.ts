import { form, getRequestEvent } from '$app/server'
import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public'
import { authError, formError } from '$lib/forms/schemas'
import * as z from '$lib/forms/zod'
import { createClient } from '@supabase/supabase-js'
import { error, invalid } from '@sveltejs/kit'

/**
 * Check `password` against the account without disturbing the caller's session. `locals.supabase`
 * writes auth cookies, so signing in through it would swap the live session out from under the
 * user; this throwaway client persists nothing and its own session is revoked right after.
 *
 * `scope: 'local'` matters — the default ('global') would revoke every refresh token the user has,
 * signing them out of all their devices just for typing their password.
 */
async function verifyPassword(email: string, password: string): Promise<boolean> {
  const client = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { error: signInError } = await client.auth.signInWithPassword({ email, password })
  await client.auth.signOut({ scope: 'local' })

  return signInError == null
}

/**
 * Start an email change. No password prompt here: Supabase's secure email change mails a link to
 * both the current and the new address and applies the change only once both are opened, so a
 * stolen session can't complete it without the old inbox either way.
 */
export const updateEmail = form(
  z.object({ email: z.email({ error: formError('form_required') }) }),
  async ({ email }) => {
    const {
      locals: { claims, supabase },
      url,
    } = getRequestEvent()

    if (claims == null) {
      error(401, 'Not authenticated')
    }

    const { error: updateError } = await supabase.auth.updateUser(
      { email },
      { emailRedirectTo: `${url.origin}/auth/confirm?next=/settings` },
    )

    if (updateError != null) {
      invalid(authError(updateError))
    }

    return { email, success: true }
  },
)

const updatePasswordSchema = z
  .object({
    confirmPassword: z.string({ error: formError('form_required') }),
    currentPassword: z.string({ error: formError('form_required') }),
    password: z
      .string({ error: formError('form_required') })
      .check(z.minLength(8, { error: formError('form_charsMin', { count: 8 }) })),
  })
  .check(
    z.refine((v) => v.password === v.confirmPassword, {
      error: formError('auth_passwordMismatch'),
      path: ['confirmPassword'],
    }),
  )

/**
 * Change the password. Unlike the email change there is no second inbox in the loop, so the current
 * password is the only thing standing between a stolen session and a permanent account takeover.
 */
export const updatePassword = form(updatePasswordSchema, async ({ currentPassword, password }, issue) => {
  const {
    locals: { claims, supabase },
  } = getRequestEvent()

  // The address comes from the verified token, never from `session.user.email`. That field is
  // lifted verbatim out of the unsigned cookie, so it used to be attacker-chosen: signing in with
  // your own account and rewriting it to a victim's address turned the check below, which reports
  // whether a password is correct, into a guessing oracle against any account in the project.
  if (claims?.email == null) {
    error(401, 'Not authenticated')
  }

  if (!(await verifyPassword(claims.email, currentPassword))) {
    invalid(issue.currentPassword(formError('settings_passwordIncorrect')))
  }

  // Supabase rejects a password it considers unchanged or too weak; `authError` maps those codes
  // onto our copy so the rules the server owns still read in the user's language.
  const { error: updateError } = await supabase.auth.updateUser({ password })

  if (updateError != null) {
    invalid(authError(updateError))
  }

  return { success: true }
})
