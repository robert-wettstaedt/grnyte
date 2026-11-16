import { completeOAuth } from '$lib/auth/oauth/flow.server'
import { redirect } from '@sveltejs/kit'
import type { RequestHandler } from './$types'

/** Registered at Apple: never move it. The literal folder pins the provider. */
export const GET: RequestHandler = (event) => completeOAuth(event, 'apple')

/**
 * Apple's `form_post` arrives cross-site, where no Lax cookie travels: answer with a same-origin GET.
 * Reads only `code`, `state` and `error`; Apple's `user` is dropped unread. Sets no cookie.
 */
export const POST: RequestHandler = async ({ request }) => {
  const form = await request.formData()
  const params = new URLSearchParams()
  for (const name of ['code', 'state', 'error']) {
    const value = form.get(name)
    if (typeof value === 'string') params.set(name, value)
  }
  redirect(303, `/auth/callback/apple?${params}`)
}
