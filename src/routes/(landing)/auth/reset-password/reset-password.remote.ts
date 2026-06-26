import { form, getRequestEvent } from '$app/server'
import { formError } from '$lib/forms/schemas'
import { invalid } from '@sveltejs/kit'
import { z } from 'zod'

const resetPasswordSchema = z
  .object({
    password: z
      .string({ error: formError('form_required') })
      .min(8, { error: formError('form_charsMin', { count: 8 }) }),
    confirmPassword: z.string({ error: formError('form_required') }),
  })
  .refine((v) => v.password === v.confirmPassword, {
    error: formError('auth_passwordMismatch'),
    path: ['confirmPassword'],
  })

export const resetPassword = form(resetPasswordSchema, async ({ password }) => {
  const {
    locals: { supabase },
  } = getRequestEvent()

  // Relies on the recovery session established by the email link (see auth/confirm).
  const { error } = await supabase.auth.updateUser({ password })

  if (error != null) {
    invalid(error.message)
  }

  return { success: true }
})
