import { CONTESTED_SIGNUP } from '$lib/auth'
import { supabaseAdmin } from '$lib/db/supabaseAdmin.server'
import { logServerFailure } from '$lib/logging/failure.server'

/**
 * Before re-mailing an unconfirmed account: its password may be a stranger's, so `/auth/confirm` replaces it.
 * False when the flag did not land; the caller then sends nothing, since confirming would keep that password.
 */
export async function flagContestedSignup(authUserId: string): Promise<boolean> {
  const { error } = await supabaseAdmin().auth.admin.updateUserById(authUserId, {
    app_metadata: { [CONTESTED_SIGNUP]: true },
  })
  if (error != null) {
    await logServerFailure('signup-contested', `flag failed for ${authUserId}: ${error.code ?? error.message}`)
  }
  return error == null
}
