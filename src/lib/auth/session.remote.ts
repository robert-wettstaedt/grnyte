import { resolve } from '$app/paths'
import { form, getRequestEvent } from '$app/server'
import { isSameOriginPath } from '$lib/auth'
import * as z from '$lib/forms/zod'
import { redirect } from '@sveltejs/kit'

/**
 * A same-origin path to come back to after signing out. Validated rather than trusted: this value
 * arrives in a form body, and an unchecked one turns this into an open redirect. See
 * {@link isSameOriginPath} for why that check is not a `startsWith`.
 */
const returnPath = z._default(
  z.string().check(z.refine(isSameOriginPath, 'must be a same-origin path')),
  resolve('/(landing)/auth'),
)

/**
 * Sign out and land on `redirectTo`.
 *
 * Server-side, so the landing group does not have to ship a Supabase client for one button, and
 * shared because two screens need it for the same reason: the person reading them is signed in as
 * the wrong account. The invitation screen comes back to its own token URL (without that the
 * invitee lands on a tokenless page reading as invalid); the region-create screen has no chrome
 * of its own, so this is its only way out.
 */
export const signOut = form(z.object({ redirectTo: returnPath }), async ({ redirectTo }) => {
  const {
    locals: { supabase },
  } = getRequestEvent()

  // ponytail: this path cannot release the browser's push subscription (it is a server form, and
  // the endpoint only exists client-side). The next sign-in on this browser takes the row over,
  // which is what `subscribeToPush`'s endpoint delete is for. Upgrade = make this a client action
  // if a shared-device leak is ever actually reported.
  await supabase.auth.signOut()

  redirect(303, redirectTo)
})
