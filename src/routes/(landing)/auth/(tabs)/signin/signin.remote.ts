import { resolve } from '$app/paths'
import { form, getRequestEvent } from '$app/server'
import { formError } from '$lib/forms/schemas'
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

  // Surface supabase's message as a form-level issue (FormError); resolveIssueMessage
  // falls back to the raw string for keys it doesn't recognise.
  if (error != null) {
    invalid(error.message)
  }

  redirect(303, resolve('/explore'))
})
