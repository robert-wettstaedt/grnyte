import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { isDefinitiveRefusal } from './authRecovery'

/** `signedOut`: nothing is stored any more. `unreadable`: it cannot be told now, which signs nobody out. */
export type Checked = 'signedOut' | 'unreadable' | Session

type Auth = Pick<SupabaseClient['auth'], 'getSession' | 'refreshSession' | 'signOut'>

/**
 * What the browser stores for this document's account. Given the token the server refused, a session that still holds
 * it is renewed, and signed out when it is gone: auth-js keeps one whose token has not expired.
 */
export async function checkSession(
  auth: Auth,
  { refused, userId }: { refused?: string; userId: string },
): Promise<Checked> {
  const stillRefused = (session: Checked) =>
    typeof session !== 'string' && session.user.id === userId && session.access_token === refused

  const stored = await read(auth)
  if (!stillRefused(stored)) return stored

  const { error } = await auth.refreshSession().catch((thrown: { code?: string }) => ({ error: thrown }))
  // Read again: the refresh renewed it, or another tab did while this one was refused.
  const after = await read(auth)
  if (error == null || !isDefinitiveRefusal(error) || !stillRefused(after)) return after

  await auth.signOut({ scope: 'local' })
  return 'signedOut'
}

async function read(auth: Auth): Promise<Checked> {
  const { data, error } = await auth.getSession()
  if (error != null) return 'unreadable'
  return data.session ?? 'signedOut'
}
