import { getRequestEvent } from '$app/server'
import { requireLiveSession } from '$lib/auth/server/session.server'
import { provisionProfile } from '$lib/entities/user/provision.server'
import { formError } from '$lib/forms/schemas'
import { getLocale } from '$lib/paraglide/runtime'
import { refuseCommand } from '$lib/remote/authed.server'
import { error } from '@sveltejs/kit'

/** The profile step: creates the profile of a signed-in account that has none. */
export async function completeProfile({ gradingScale, username }: { gradingScale: 'FB' | 'V'; username: string }) {
  const { locals, url } = getRequestEvent()
  // `claims`, not `requireAuthed`: that demands the `users` row this creates.
  if (locals.claims == null) error(401, formError('auth_notSignedIn'))
  await requireLiveSession()

  const { kind } = await provisionProfile({
    authUserId: locals.claims.sub,
    contactLocale: getLocale(),
    gradingScale,
    origin: url.origin,
    username,
  })
  if (kind === 'deleted') refuseCommand(formError('auth_accountDeleted'))
}
