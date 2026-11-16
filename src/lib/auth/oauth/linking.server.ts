import { revokes, type ReauthAction, type VerifiedToken } from '$lib/auth'
import { recentAppleEvent, recordAuthEvent } from '$lib/auth/events.server'
import { writeGrant, type ReauthCaller } from '$lib/auth/reauth.server'
import { isSessionLive } from '$lib/auth/session.server'
import { db } from '$lib/db/db.server'
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

/**
 * "Confirm with Apple": the caller's own Apple ID confirms `action` on `target` as a mailed code
 * would. Revokes first where the action calls for it, and writes the grant either way. `revoke`
 * runs only after the Apple ID proved the caller's own.
 */
export async function acceptAppleConfirmation(
  token: VerifiedToken,
  caller: ReauthCaller,
  action: ReauthAction,
  target: string,
  claims: { sub: string },
  revoke: () => Promise<boolean>,
): Promise<'expired' | 'granted' | 'wrongAppleId'> {
  if (!(await isStartingCaller(token, caller))) return 'expired'
  const { authUserId } = caller
  const [row] = await pinnedTx((tx) =>
    tx.execute<{ own: boolean }>(sql`
      select exists (select 1 from auth.identities i
        where i.user_id = ${authUserId} and i.provider = 'apple' and i.provider_id = ${claims.sub}) as own`),
  )
  if (!row.own) {
    await recordAuthEvent('oauth_sub_mismatch', { authUserId, detail: { provider: 'apple' } })
    return 'wrongAppleId'
  }
  if (revokes(action, target)) {
    // Before the call: Apple's consent-revoked can arrive before its answer, or the answer can be lost.
    await recordAuthEvent('apple_revoke_started', { authUserId, detail: { action, provider: 'apple', target } })
    const revoked = await revoke()
    await recordAuthEvent(revoked ? 'apple_revoked' : 'apple_revoke_failed', {
      authUserId,
      detail: { action, provider: 'apple', target },
    })
  }
  await writeGrant(caller, action, target, 'apple')
  return 'granted'
}

/**
 * Whether Apple's token was revoked for this action and target just now. When the account had Apple
 * and it was not, records `apple_revoke_skipped`: the person is told to remove grnyte in Apple's settings.
 */
export async function appleRevocation(
  authUserId: string,
  action: ReauthAction,
  target: string,
  { linked }: { linked: boolean },
): Promise<boolean> {
  const revoked = await recentAppleEvent(authUserId, 'apple_revoked', { action, target })
  if (linked && !revoked) {
    await recordAuthEvent('apple_revoke_skipped', { authUserId, detail: { action, provider: 'apple', target } })
  }
  return revoked
}

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

/** The request comes from the session that started the flow, still live (the check the trigger cannot make). */
export async function isStartingCaller(token: VerifiedToken, caller: ReauthCaller): Promise<boolean> {
  const { claims } = token
  if (claims.sub !== caller.authUserId || claims.session_id !== caller.sessionId) return false
  return isSessionLive(db, claims)
}
