import { form, getRequestEvent } from '$app/server'
import { db } from '$lib/db/db.server'
import * as schema from '$lib/db/schema'
import { notifyAdminsOfSignup } from '$lib/entities/notification/signup.server'
import { authError, formError, usernameSchema } from '$lib/forms/schemas'
import { getLocale } from '$lib/paraglide/runtime'
import { invalid } from '@sveltejs/kit'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

const signUpSchema = z
  .object({
    confirmPassword: z.string({ error: formError('form_required') }),
    email: z.email({ error: formError('form_required') }),
    password: z
      .string({ error: formError('form_required') })
      .min(8, { error: formError('form_charsMin', { count: 8 }) }),
    username: usernameSchema,
  })
  .refine((v) => v.password === v.confirmPassword, {
    error: formError('auth_passwordMismatch'),
    path: ['confirmPassword'],
  })

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

  // Create the app-level user + settings rows and link them. Uses the base (non-RLS)
  // client because there is no authenticated session yet at sign-up.
  const [createdUser] = await db.insert(schema.users).values({ authUserFk: data.user.id, username }).returning()
  // `contactLocale` is seeded from the request locale: the best guess on the device the account
  // was made on, and the only signal we have until they pick a language in settings.
  const [createdSettings] = await db
    .insert(schema.userSettings)
    .values({ authUserFk: data.user.id, contactLocale: getLocale(), userFk: createdUser.id })
    .returning()
  await db.update(schema.users).set({ userSettingsFk: createdSettings.id }).where(eq(schema.users.id, createdUser.id))

  // Last, and after the rows it names exist. Never throws, so a push service or mail host that is
  // down cannot fail a sign-up that already succeeded.
  await notifyAdminsOfSignup({ origin: url.origin, userFk: createdUser.id, username })

  // No redirect: Supabase may require email confirmation before the first sign-in, so we
  // surface a success message and let the user head to the sign-in tab.
  return { success: true }
})
