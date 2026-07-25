import { resolve } from '$app/paths'
import { form, getRequestEvent } from '$app/server'
import { authError, formError } from '$lib/forms/schemas'
import { invalid, redirect } from '@sveltejs/kit'
import { z } from 'zod'

const signInSchema = z.object({
  email: z
    .string({ error: formError('form_required') })
    .trim()
    .min(1, { error: formError('form_required') }),
  password: z.string({ error: formError('form_required') }).min(1, { error: formError('form_required') }),
})

export const signIn = form(signInSchema, async ({ email, password }) => {
  const {
    locals: { supabase },
  } = getRequestEvent()

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  // Supabase only speaks English, so its error code is mapped onto our copy and surfaced as a
  // form-level issue (FormError).
  if (error != null) {
    invalid(authError(error))
  }

  redirect(303, resolve('/explore'))
})
