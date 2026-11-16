import { pinnedTx } from '$lib/db/pinned.server'
import { sql } from 'drizzle-orm'

export interface SignInMethods {
  hasPassword: boolean
  providers: SignInProvider[]
}
export type SignInProvider = 'apple' | 'email' | 'google'

const KNOWN: ReadonlySet<string> = new Set<SignInProvider>(['apple', 'email', 'google'])

/** How the account can sign in, read from its identities (never `raw_app_meta_data`, which lags them). */
export async function signInMethods(authUserId: string): Promise<SignInMethods> {
  const [row] = await pinnedTx((tx) =>
    tx.execute<{ has_password: boolean; providers: string[] }>(sql`
      select coalesce(u.encrypted_password, '') <> '' as has_password,
        array(select distinct i.provider from auth.identities i where i.user_id = u.id order by 1) as providers
      from auth.users u where u.id = ${authUserId}`),
  )
  return {
    hasPassword: row?.has_password ?? false,
    providers: (row?.providers ?? []).filter((p): p is SignInProvider => KNOWN.has(p)),
  }
}
