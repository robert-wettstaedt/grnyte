import { resolve } from '$app/paths'
import { pinnedTx } from '$lib/db/pinned.server'
import { users } from '$lib/db/schema'
import { notifyAdminsOfSignup } from '$lib/entities/notification/signup.server'
import { logServerFailure } from '$lib/logging/failure.server'
import { stringifyError } from '$lib/logging/stringify'
import type { EmailOtpType } from '@supabase/supabase-js'
import { redirect } from '@sveltejs/kit'
import { eq } from 'drizzle-orm'
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
    const { data, error } = await locals.supabase.auth.verifyOtp({ token_hash, type })
    if (!error) {
      // Alerted here rather than at sign-up, so accounts nobody confirms never reach an admin.
      if (type === 'signup' && data.user != null) {
        await alertConfirmedSignup(url.origin, data.user.id)
      }
      redirectTo.searchParams.delete('next')
      redirect(303, redirectTo)
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
    if (token_hash == null) {
      redirectTo.searchParams.delete('next')
      redirect(303, redirectTo)
    }
  }

  redirectTo.pathname = resolve('/(landing)/auth/error')
  redirect(303, redirectTo)
}

/** Never throws: the token is already spent, so a failure here must not cost the redirect. */
async function alertConfirmedSignup(origin: string, authUserId: string): Promise<void> {
  try {
    const [user] = await pinnedTx((tx) =>
      tx
        .select({ id: users.id, username: users.username })
        .from(users)
        .where(eq(users.authUserFk, authUserId))
        .limit(1),
    )
    if (user != null) {
      await notifyAdminsOfSignup({ origin, userFk: user.id, username: user.username })
    }
  } catch (error) {
    await logServerFailure('signup-alert', stringifyError(error))
  }
}
