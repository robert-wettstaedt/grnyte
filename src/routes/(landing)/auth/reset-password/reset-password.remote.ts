import { form, getRequestEvent } from '$app/server'
import { authError, formError, passwordSchema, passwordsMatch } from '$lib/forms/schemas'
import * as z from '$lib/forms/zod'
import { invalid } from '@sveltejs/kit'

const resetPasswordSchema = z
  .object({
    confirmPassword: z.string({ error: formError('form_required') }),
    password: passwordSchema,
  })
  .check(passwordsMatch)

export const resetPassword = form(resetPasswordSchema, async ({ password }) => {
  const {
    locals: { supabase },
  } = getRequestEvent()

  // Relies on the recovery session established by the email link (see auth/confirm).
  const { error } = await supabase.auth.updateUser({ password })

  if (error != null) {
    invalid(authError(error))
  }

  return { success: true }
})
