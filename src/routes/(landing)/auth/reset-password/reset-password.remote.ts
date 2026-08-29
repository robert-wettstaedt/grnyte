import { form, getRequestEvent } from '$app/server'
import { authError, formError } from '$lib/forms/schemas'
import * as z from '$lib/forms/zod'
import { invalid } from '@sveltejs/kit'

const resetPasswordSchema = z
  .object({
    confirmPassword: z.string({ error: formError('form_required') }),
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
