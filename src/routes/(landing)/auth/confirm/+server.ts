import { resolve } from '$app/paths'
import { AUTH_PATH, isContested, sameOriginPath, signedInRedirectTarget } from '$lib/auth'
import { revokeContestedPassword } from '$lib/auth/contested.server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { redirect } from '@sveltejs/kit'
import type { RequestHandler } from './$types'

/** The dashboard invite's `/auth/reset-password` stays a direct step (unclaimed); the rest ends on /auth/continue. */
function destination(next: string): string {
  const path = sameOriginPath(next)
  return path?.startsWith(AUTH_PATH) ? path : signedInRedirectTarget(next)
}

export const GET: RequestHandler = async ({ locals, url }) => {
  const token_hash = url.searchParams.get('token_hash')
  const type = url.searchParams.get('type') as EmailOtpType | null
  const next = url.searchParams.get('next') ?? '/'

  if (token_hash && type) {
    const { data, error } = await locals.supabase.auth.verifyOtp({ token_hash, type })
    if (!error) {
      const user = data.user
      // Any link type: a magic link confirms an address as well as a sign-up link does.
      const contested = user != null && isContested(user.app_metadata)
      const signedIn = contested ? await revokeContestedPassword(locals.supabase, user.id) : true
      if (contested) {
        const to = resolve(signedIn ? '/(landing)/auth/reset-password' : '/(landing)/auth/forgot-password')
        redirect(303, `${to}?${new URLSearchParams({ contested: '1', next })}`)
      }
      redirect(303, destination(next))
    }
  }

  if (locals.claims != null) {
    // Refresh so a newly confirmed change (e.g. a new email) lands in the session claims. No
    // argument: the client reads the current session out of the request cookies itself, and the
    // one this server trusts is the verified token, which is not the shape `refreshSession` takes.
    await locals.supabase.auth.refreshSession()

    // Supabase can verify the link on its own side and bounce here with the tokens in the URL
    // fragment, which never reaches the server. A signed-in caller arriving without a token has
    // therefore already been confirmed: pass them through instead of crying error.
    if (token_hash == null) redirect(303, destination(next))
  }

  // The failure keeps the link's other parameters (`next`), minus its spent token.
  const failed = new URL(url)
  failed.pathname = resolve('/(landing)/auth/error')
  failed.searchParams.delete('token_hash')
  failed.searchParams.delete('type')
  redirect(303, failed)
}
