import { form, getRequestEvent } from '$app/server'
import { acceptPath } from '$lib/entities/region/dto'
import { redirect } from '@sveltejs/kit'
import { z } from 'zod'

/**
 * Sign out and come back to the same token URL, for the invitee who is signed in as the wrong
 * account. Server-side, like the rest of the landing auth flows, so this group does not have to
 * ship a Supabase client for one button.
 *
 * The token rides in the form body rather than the URL, because the redirect is what puts them
 * back on this same invitation — without it they land on a tokenless page reading as invalid.
 */
export const signOut = form(z.object({ token: z.string() }), async ({ token }) => {
  const {
    locals: { supabase },
  } = getRequestEvent()

  await supabase.auth.signOut()

  redirect(303, token === '' ? '/invite/accept' : acceptPath(token))
})
