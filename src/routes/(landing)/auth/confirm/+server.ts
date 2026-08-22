import { resolve } from '$app/paths'
import type { EmailOtpType } from '@supabase/supabase-js'
import { redirect } from '@sveltejs/kit'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async ({ locals, url }) => {
  const token_hash = url.searchParams.get('token_hash')
  const type = url.searchParams.get('type') as EmailOtpType | null
  const next = url.searchParams.get('next') ?? '/'

  /**
   * Clean up the redirect URL by deleting the Auth flow parameters.
   *
   * `next` is preserved for now, because it's needed in the error case.
   */
  const redirectTo = new URL(url)
  redirectTo.pathname = next
  redirectTo.searchParams.delete('token_hash')
  redirectTo.searchParams.delete('type')

  if (token_hash && type) {
    const { error } = await locals.supabase.auth.verifyOtp({ token_hash, type })
    if (!error) {
      redirectTo.searchParams.delete('next')
      redirect(303, redirectTo)
    }
  }

  if (locals.claims != null) {
    // Refresh so a just-confirmed change (e.g. a new email) lands in the session claims. No
    // argument: the client reads the current session out of the request cookies itself, and the
    // one this server trusts is the verified token, which is not the shape `refreshSession` takes.
    await locals.supabase.auth.refreshSession()

    // Supabase can verify the link on its own side and bounce here with the tokens in the URL
    // fragment, which never reaches the server. A signed-in caller arriving without a token has
    // therefore already been confirmed — pass them through instead of crying error.
    if (token_hash == null) {
      redirectTo.searchParams.delete('next')
      redirect(303, redirectTo)
    }
  }

  redirectTo.pathname = resolve('/(landing)/auth/error')
  redirect(303, redirectTo)
}
