import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public'
import { createClient } from '@supabase/supabase-js'

/**
 * Check `password` against the account without disturbing the caller's session. `locals.supabase`
 * writes auth cookies, so signing in through it would swap the live session out from under the
 * user; this throwaway client persists nothing and its own session is revoked right after.
 *
 * `scope: 'local'` matters: the default ('global') would revoke every refresh token the user has,
 * signing them out of all their devices only for typing their password.
 */
export async function verifyPassword(email: string, password: string): Promise<boolean> {
  const client = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { error: signInError } = await client.auth.signInWithPassword({ email, password })
  await client.auth.signOut({ scope: 'local' })

  return signInError == null
}
