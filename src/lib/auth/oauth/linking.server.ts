import { pinnedTx } from '$lib/db/pinned.server'
import { sql } from 'drizzle-orm'
import type { OAuthProvider } from './providers.server'

export type LinkDecision = 'alreadyLinked' | 'emailElsewhere' | 'identityElsewhere' | 'ok'

export type SignInDecision =
  /** (provider, sub) is already an identity. */
  | { kind: 'known' }
  /** No account has the address. */
  | { kind: 'new' }
  /** The provider owns the address's domain: the identity trigger lets the auto-link in. */
  | { kind: 'providerDomain' }
  /** A confirmed account with no identity for this provider. */
  | { kind: 'refuse' }
  /** GoTrue takes the unconfirmed account over. */
  | { kind: 'unconfirmed' }

/** Whether the verified identity may join `authUserId`: never one on another account, nor another account's address. */
export async function decideLink(
  authUserId: string,
  provider: OAuthProvider,
  claims: { email?: string; sub: string },
): Promise<LinkDecision> {
  const email = (claims.email ?? '').toLowerCase()
  const [row] = await pinnedTx((tx) =>
    tx.execute<{ owner: null | string; taken: boolean }>(sql`
      select
        (select i.user_id from auth.identities i where i.provider = ${provider} and i.provider_id = ${claims.sub}) as owner,
        exists (select 1 from auth.users u where u.email = ${email} and u.id <> ${authUserId}) as taken`),
  )
  if (row.owner === authUserId) return 'alreadyLinked'
  if (row.owner != null) return 'identityElsewhere'
  return row.taken ? 'emailElsewhere' : 'ok'
}

/** Which way a provider sign-in goes; the domain list is the trigger's own SQL function, never a copy. */
export async function decideSignIn(
  provider: OAuthProvider,
  claims: { email?: string; sub: string },
): Promise<SignInDecision> {
  const email = (claims.email ?? '').toLowerCase()
  const [row] = await pinnedTx((tx) =>
    tx.execute<{ confirmed: boolean | null; known: boolean; owned: boolean }>(sql`
      select
        exists (select 1 from auth.identities i where i.provider = ${provider} and i.provider_id = ${claims.sub}) as known,
        (select u.email_confirmed_at is not null from auth.users u where u.email = ${email} limit 1) as confirmed,
        split_part(${email}, '@', 2) = any (public.provider_owned_domains(${provider})) as owned`),
  )
  if (row.known) return { kind: 'known' }
  if (email === '' || row.confirmed == null) return { kind: 'new' }
  if (!row.confirmed) return { kind: 'unconfirmed' }
  return { kind: row.owned ? 'providerDomain' : 'refuse' }
}
