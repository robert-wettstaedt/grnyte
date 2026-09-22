import { form, getRequestEvent } from '$app/server'
import { pinnedTx } from '$lib/db/pinned.server'
import * as schema from '$lib/db/schema'
import { notifyAdminsOfSignup } from '$lib/entities/notification/signup.server'
import { authError, formError, passwordSchema, passwordsMatch, usernameSchema } from '$lib/forms/schemas'
import * as z from '$lib/forms/zod'
import { getLocale } from '$lib/paraglide/runtime'
import { invalid } from '@sveltejs/kit'
import { eq } from 'drizzle-orm'

const signUpSchema = z
  .object({
    confirmPassword: z.string({ error: formError('form_required') }),
    email: z.email({ error: formError('form_required') }),
    password: passwordSchema,
    username: usernameSchema,
  })
  .check(passwordsMatch)

// No username-uniqueness check here on purpose: a fresh account belongs to no region yet, so there
// is nothing it could collide with, and an unauthenticated "taken" answer would turn sign-up into a
// username oracle for regions the caller can't see. Collisions are resolved where they are visible
// (updateUsername checks the caller's regions).
export const signUp = form(signUpSchema, async ({ email, password, username }) => {
  const {
    locals: { supabase },
    url,
  } = getRequestEvent()

  const { data, error } = await supabase.auth.signUp({ email, password })
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
  const createdUser = await pinnedTx(async (tx) => {
    const [user] = await tx.insert(schema.users).values({ authUserFk, username }).returning()
    // `contactLocale` is seeded from the request locale: the best guess on the device the account
    // was made on, and the only signal we have until they pick a language in settings.
    const [settings] = await tx
      .insert(schema.userSettings)
      .values({ authUserFk, contactLocale: getLocale(), userFk: user.id })
      .returning()
    await tx.update(schema.users).set({ userSettingsFk: settings.id }).where(eq(schema.users.id, user.id))
    return user
  })

  // Last, and after the rows it names exist. Never throws, so a push service or mail host that is
  // down cannot fail a sign-up that already succeeded.
  await notifyAdminsOfSignup({ origin: url.origin, userFk: createdUser.id, username })

  // No redirect: Supabase may require email confirmation before the first sign-in, so we
  // surface a success message and let the user head to the sign-in tab.
  return { success: true }
})
