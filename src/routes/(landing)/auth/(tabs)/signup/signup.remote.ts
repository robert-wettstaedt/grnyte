import { form, getRequestEvent } from '$app/server'
import { pinnedTx } from '$lib/db/pinned.server'
import * as schema from '$lib/db/schema'
import { supabaseAdmin } from '$lib/db/supabaseAdmin.server'
import { spendProofOfWork } from '$lib/forms/proofOfWork.server'
import {
  authError,
  formError,
  honeypotSchema,
  isHoneypotFilled,
  passwordSchema,
  passwordsMatch,
  usernameSchema,
} from '$lib/forms/schemas'
import * as z from '$lib/forms/zod'
import { getLocale } from '$lib/paraglide/runtime'
import { invalid } from '@sveltejs/kit'
import { eq } from 'drizzle-orm'

const signUpSchema = z
  .object({
    altcha: z.optional(z.string()),
    confirmPassword: z.string({ error: formError('form_required') }),
    email: z.email({ error: formError('form_required') }),
    password: passwordSchema,
    username: usernameSchema,
    website: honeypotSchema,
  })
  .check(passwordsMatch)

// No username-uniqueness check here on purpose: a fresh account belongs to no region yet, so there
// is nothing it could collide with, and an unauthenticated "taken" answer would turn sign-up into a
// username oracle for regions the caller can't see. Collisions are resolved where they are visible
// (updateUsername checks the caller's regions).
export const signUp = form(signUpSchema, async ({ altcha, email, password, username, website }) => {
  // A bot gets the success it expects, so it has no reason to adapt.
  if (isHoneypotFilled(website)) {
    return { success: true }
  }
  if (!(await spendProofOfWork(altcha))) {
    invalid(formError('auth_verificationFailed'))
  }

  const {
    locals: { supabase },
  } = getRequestEvent()

  // GoTrue's public sign-up is switched off, so the published anon key cannot skip the checks above.
  const { data, error } = await supabaseAdmin().auth.admin.createUser({ email, email_confirm: false, password })
  if (error?.code === 'email_exists') {
    // Same answer as a new address; resend mails only an unconfirmed account, so nothing leaks.
    await supabase.auth.resend({ email, type: 'signup' })
    return { success: true }
  }
  if (error != null) {
    invalid(authError(error))
  }
  if (data.user == null) {
    invalid(formError('auth_signUpFailed'))
  }

  // The base client, not RLS, because sign-up has no session yet. All three statements in one
  // transaction: the GoTrue account exists by now, so a half-written pair leaves an address that
  // can neither sign in nor sign up again.
  // Read out here, because TypeScript drops the null narrowing inside the callback.
  const authUserFk = data.user.id
  await pinnedTx(async (tx) => {
    const [user] = await tx.insert(schema.users).values({ authUserFk, username }).returning()
    // `contactLocale` is seeded from the request locale: the best guess on the device the account
    // was made on, and the only signal we have until they pick a language in settings.
    const [settings] = await tx
      .insert(schema.userSettings)
      .values({ authUserFk, contactLocale: getLocale(), userFk: user.id })
      .returning()
    await tx.update(schema.users).set({ userSettingsFk: settings.id }).where(eq(schema.users.id, user.id))
  })

  // The admin API creates without mailing; GoTrue still renders and sends the confirmation.
  const { error: resendError } = await supabase.auth.resend({ email, type: 'signup' })
  if (resendError != null) {
    invalid(authError(resendError))
  }

  // No redirect: Supabase may require email confirmation before the first sign-in, so we
  // surface a success message and let the user head to the sign-in tab.
  return { success: true }
})
