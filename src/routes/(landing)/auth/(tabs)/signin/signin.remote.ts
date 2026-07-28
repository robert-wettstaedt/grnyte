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
  /**
   * Where to land afterwards, when something sent them here mid-flow. The invitation accept
   * screen is what this exists for: without it the emailed token dies at sign-in and the invitee
   * has to go back to their inbox to find the link again.
   */
  next: z.string().optional(),
  password: z.string({ error: formError('form_required') }).min(1, { error: formError('form_required') }),
})

export const signIn = form(signInSchema, async ({ email, next, password }) => {
  const {
    locals: { supabase },
  } = getRequestEvent()

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  // Supabase only speaks English, so its error code is mapped onto our copy and surfaced as a
  // form-level issue (FormError).
  if (error != null) {
    invalid(authError(error))
  }

  // Same-origin relative paths only. `//evil.com` and `/\evil.com` are protocol-relative URLs that
  // a browser happily follows off-site, so the second character has to be an ordinary one.
  redirect(303, next != null && /^\/[^/\\]/.test(next) ? next : resolve('/explore'))
})
