import { pinnedTx } from '$lib/db/pinned.server'
import { logServerFailure } from '$lib/logging/failure.server'
import { sql } from 'drizzle-orm'

export interface SignInMethods {
  hasPassword: boolean
  providers: SignInProvider[]
}
export type SignInProvider = 'apple' | 'email' | 'google'

const KNOWN: ReadonlySet<string> = new Set<SignInProvider>(['apple', 'email', 'google'])

/**
 * GoTrue's `email` identity, in GoTrue's shape, for a confirmed account that has none. A password set on an
 * account with only a provider writes none (gotrue.contract), and GoTrue never unlinks an account's only identity.
 */
export async function addEmailIdentity(authUserId: string): Promise<void> {
  try {
    await pinnedTx((tx) =>
      tx.execute(sql`
        insert into auth.identities (user_id, provider, provider_id, identity_data, created_at, updated_at, last_sign_in_at)
        select u.id, 'email', u.id::text,
          jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true, 'phone_verified', false),
          now(), now(), now()
        from auth.users u
        where u.id = ${authUserId} and u.email is not null and u.email_confirmed_at is not null
          and not exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email')
        on conflict do nothing`),
    )
  } catch (cause) {
    // The password stands; only removing the provider stays blocked.
    await logServerFailure('auth', `email identity not added for ${authUserId}: ${String(cause)}`)
  }
}

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
