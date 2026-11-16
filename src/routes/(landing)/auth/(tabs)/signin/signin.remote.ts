import { resolve } from '$app/paths'
import { form, getRequestEvent } from '$app/server'
import { isContested, signedInRedirectTarget } from '$lib/auth'
import { endSession } from '$lib/auth/contested.server'
import { rememberMethod } from '$lib/auth/lastMethod.server'
import { gotrueRefusal } from '$lib/auth/mail.server'
import { hasDeletionMarker } from '$lib/entities/user/provision.server'
import { formError } from '$lib/forms/schemas'
import * as z from '$lib/forms/zod'
import { invalid } from '@sveltejs/kit'
import { signInWithPassword } from './signin.server'

const signInSchema = z.object({
  /** Sent by pages that can show the code step; an older tab gets the form-level message instead. */
  codeFlow: z.optional(z.string()),
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

export const signIn = form(signInSchema, async ({ codeFlow, email, next, password }) => {
  const event = getRequestEvent()
  const signedIn = await signInWithPassword({ email, password }, invalid)
  if (signedIn.kind === 'unconfirmed') {
    if (codeFlow == null) invalid(formError('auth_emailNotConfirmed'))
    const { confirm, resendToken } = signedIn
    return { confirm, resendToken }
  }
  const { data, error } = signedIn.answer
  if (error != null) invalid(await gotrueRefusal(error, 'token'))

  // Decided before any cookie is written; the GoTrue session ends unused.
  // What an account deletion left: the right password signs nothing in.
  if (await hasDeletionMarker(data.user.id)) {
    await endSession(data.session)
    invalid(formError('auth_accountDeleted'))
  }
  // Still contested means its password may be a stranger's.
  if (isContested(data.user.app_metadata)) {
    await endSession(data.session)
    return { redirectTo: `${resolve('/auth/forgot-password')}?contested=1` }
  }

  await event.locals.supabase.auth.setSession(data.session)
  rememberMethod(event.cookies, 'email')

  // Returned rather than redirected: a 303 becomes a pushing `goto` in Kit's remote-form client,
  // which leaves this sign-in page in history for a signed-in reader to walk back into. The page
  // replaces the entry instead. `signedInRedirectTarget` is still shared with the hook's signed-in
  // bounce: same question, and two copies drifted apart on the CRLF handling once already.
  return { redirectTo: signedInRedirectTarget(next) }
})
