import { resolve } from '$app/paths'
import { form, getRequestEvent } from '$app/server'
import { isContested, signedInRedirectTarget } from '$lib/auth'
import { authError, formError } from '$lib/forms/schemas'
import * as z from '$lib/forms/zod'
import { invalid } from '@sveltejs/kit'

const signInSchema = z.object({
  email: z
    .string({ error: formError('form_required') })
    .check(z.trim(), z.minLength(1, { error: formError('form_required') })),
  /**
   * Where to land afterwards, when something sent them here mid-flow. The invitation accept
   * screen is what this exists for: without it the emailed token dies at sign-in and the invitee
   * has to go back to their inbox to find the link again.
   */
  next: z.optional(z.string()),
  password: z
    .string({ error: formError('form_required') })
    .check(z.minLength(1, { error: formError('form_required') })),
})

export const signIn = form(signInSchema, async ({ email, next, password }) => {
  const {
    locals: { supabase },
  } = getRequestEvent()

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  // Supabase only speaks English, so its error code is mapped onto our copy and surfaced as a
  // form-level issue (FormError).
  if (error != null) {
    invalid(authError(error))
  }

  // Still contested means `/auth/confirm` could not replace the password, so it may be a stranger's.
  if (isContested(data.user?.app_metadata)) {
    await supabase.auth.signOut({ scope: 'local' })
    return { redirectTo: `${resolve('/auth/forgot-password')}?contested=1` }
  }

  // Returned rather than redirected: a 303 becomes a pushing `goto` in Kit's remote-form client,
  // which leaves this sign-in page in history for a signed-in reader to walk back into. The page
  // replaces the entry instead. `signedInRedirectTarget` is still shared with the hook's signed-in
  // bounce: same question, and two copies drifted apart on the CRLF handling once already.
  return { redirectTo: signedInRedirectTarget(next) }
})
