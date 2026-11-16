import { IDENTITY_TARGETS, type OAuthProvider } from '$lib/auth'
import { pinnedTx, type Tx } from '$lib/db/pinned.server'
import { logServerFailure } from '$lib/logging/failure.server'
import { sql } from 'drizzle-orm'

export interface SignInMethods {
  hasPassword: boolean
  /** Every identity, `email` included. */
  identities: number
  providers: SignInProvider[]
  /** The next "Continue with" re-links these on its own: the provider owns the address and reports it. */
  relinks: SignInProvider[]
}

export type SignInProvider = 'apple' | 'email' | 'google'

const KNOWN: ReadonlySet<string> = new Set<SignInProvider>(['apple', 'email', 'google'])

interface ProviderState {
  canUnlink: boolean
  linked: boolean
  /** The next "Continue with" re-links it on its own: the provider owns the address and reports it. */
  relinks: boolean
}

/** Each provider's state from `signInMethods`, read as the identity trigger and `decideSignIn` read them. */
export function accountMethods({ hasPassword, identities, providers, relinks }: SignInMethods) {
  const state = (provider: OAuthProvider): ProviderState => {
    const linked = providers.includes(provider)
    // An `email` identity without a password signs nothing in, so only a password or another provider remains.
    const remains = hasPassword || IDENTITY_TARGETS.some((other) => other !== provider && providers.includes(other))
    return { canUnlink: linked && identities >= 2 && remains, linked, relinks: relinks.includes(provider) }
  }
  return { hasPassword, providers: { apple: state('apple'), google: state('google') } }
}

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
export async function signInMethods(authUserId: string, tx?: Tx): Promise<SignInMethods> {
  const read = (on: Tx) =>
    on.execute<{ has_password: boolean; identities: number; providers: string[]; relinks: string[] }>(sql`
      select coalesce(u.encrypted_password, '') <> '' as has_password,
        (select count(*) from auth.identities i where i.user_id = u.id)::int as identities,
        array(select distinct i.provider from auth.identities i where i.user_id = u.id order by 1) as providers,
        array(select distinct i.provider from auth.identities i where i.user_id = u.id
          and lower(split_part(u.email, '@', 2)) = any (public.provider_owned_domains(i.provider))
          and lower(i.identity_data->>'email') = lower(u.email) order by 1) as relinks
      from auth.users u where u.id = ${authUserId}`)
  const [row] = await (tx == null ? pinnedTx(read) : read(tx))
  const known = (list: string[] = []) => list.filter((p): p is SignInProvider => KNOWN.has(p))
  return {
    hasPassword: row?.has_password ?? false,
    identities: row?.identities ?? 0,
    providers: known(row?.providers),
    relinks: known(row?.relinks),
  }
}
