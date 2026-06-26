import { form, getRequestEvent } from '$app/server'
import { formError } from '$lib/forms/schemas'
import { invalid } from '@sveltejs/kit'
import { z } from 'zod'

const forgotPasswordSchema = z.object({
  email: z.email({ error: formError('form_required') }),
})

export const forgotPassword = form(forgotPasswordSchema, async ({ email }) => {
  const {
    url,
    locals: { supabase },
  } = getRequestEvent()

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${url.origin}/auth/reset-password`,
  })

  if (error != null) {
    invalid(error.message)
  }

  return { success: true, email }
})
