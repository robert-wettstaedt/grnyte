import { command, getRequestEvent } from '$app/server'
import { signedInRedirectTarget } from '$lib/auth'
import { provisionProfile } from '$lib/entities/user/provision.server'
import { formError } from '$lib/forms/schemas'
import { getLocale } from '$lib/paraglide/runtime'
import { refuseCommand } from '$lib/remote/authed.server'
import { error } from '@sveltejs/kit'
import { profileSchema } from './schemas'

/** The profile step: creates the profile of a signed-in account that has none. */
export const completeProfile = command(profileSchema, async ({ gradingScale, next, username }) => {
  const { locals, url } = getRequestEvent()
  // `claims`, not `requireAuthed`: that demands the `users` row this creates.
  if (locals.claims == null) error(401, formError('auth_notSignedIn'))

  const { kind } = await provisionProfile({
    authUserId: locals.claims.sub,
    contactLocale: getLocale(),
    gradingScale,
    origin: url.origin,
    username,
  })
  if (kind === 'deleted') refuseCommand(formError('auth_accountDeleted'))
  return { redirectTo: signedInRedirectTarget(next) }
})
