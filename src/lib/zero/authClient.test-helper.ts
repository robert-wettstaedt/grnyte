import type { Session, SupabaseClient } from '@supabase/supabase-js'

export type Stored = null | { token: string; userId: string }

export const session = ({ token, userId }: NonNullable<Stored>) =>
  ({ access_token: token, user: { id: userId } }) as Session

/** An auth client over one stored session, whose refresh does what the test says. */
export function authClient(stored: Stored, refresh: () => unknown = () => null) {
  const state = { readError: undefined as unknown, refreshes: 0, stored }
  const auth = {
    getSession: async () => ({
      data: { session: state.readError == null && state.stored != null ? session(state.stored) : null },
      error: state.readError ?? null,
    }),
    refreshSession: async () => {
      state.refreshes += 1
      const error = await refresh()
      return { data: { session: null, user: null }, error: error ?? null }
    },
    signOut: async () => {
      state.stored = null
      return { error: null }
    },
  } as unknown as SupabaseClient['auth']
  return { auth, state }
}
