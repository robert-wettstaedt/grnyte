import { getRequestEvent } from '$app/server'
import { PROVIDER_NAMES } from '$lib/auth'
import type { AuthServerAs } from '$lib/auth/authServer.server'
import { recordAuthEvent } from '$lib/auth/events.server'
import { gotrueRefusal } from '$lib/auth/mail.server'
import { appleRevocation } from '$lib/auth/oauth/linking.server'
import { configuredProviders, type OAuthProvider } from '$lib/auth/oauth/providers.server'
import { hasGrant, reauthCaller } from '$lib/auth/reauth.server'
import { callerAuthServer, requireLiveSession } from '$lib/auth/session.server'
import { pinnedTx } from '$lib/db/pinned.server'
import { formError } from '$lib/forms/schemas'
import { logServerFailure } from '$lib/logging/failure.server'
import { refuseCommand } from '$lib/remote/authed.server'
import type { UserIdentity } from '@supabase/supabase-js'
import { sql } from 'drizzle-orm'

interface Address {
  confirmedAt: null | string
  email: string
}

interface ProviderState {
  canUnlink: boolean
  linked: boolean
  /** The next "Continue with" re-links it on its own: the provider owns the address and reports it. */
  relinks: boolean
}

export async function signInMethodsQuery() {
  const { sub } = await requireLiveSession()
  return { ...(await accountMethods(sub)), configured: configuredProviders(getRequestEvent()) }
}

/** Removes a provider behind an `identity.unlink` grant, which the identity trigger spends. */
export async function unlinkProvider({ provider }: { provider: OAuthProvider }) {
  const caller = await reauthCaller()
  const auth = callerAuthServer()
  if (!(await accountMethods(caller.authUserId)).providers[provider].canUnlink) {
    refuseCommand(formError('settings_signInMethodsLastMethod', { provider: PROVIDER_NAMES[provider] }))
  }
  if (!(await hasGrant(caller, 'identity.unlink', provider))) refuseCommand(formError('auth_reauthRequired'))

  const listed = await auth.getUserIdentities()
  if (listed.error != null) refuseCommand(await gotrueRefusal(listed.error, 'identities'))
  const identity = listed.data?.identities.find((candidate) => candidate.provider === provider)
  // Already gone (another device): the screen's next read shows it.
  if (identity == null) return { othersSignedOut: false }

  const address = await accountAddress(caller.authUserId)
  try {
    await unlinkAtGoTrue(auth, identity)
  } finally {
    // Also on a refusal: GoTrue may have committed the unlink before the answer was lost.
    await keepAddress(caller.authUserId, address)
  }
  await recordAuthEvent('identity_unlinked', { authUserId: caller.authUserId, detail: { provider } })
  if (provider === 'apple') {
    await appleRevocation(caller.authUserId, 'identity.unlink', 'apple', { linked: true })
  }
  const others = await auth.signOut({ scope: 'others' })
  return { othersSignedOut: others.error == null }
}

/** The account's provider identities, read as the identity trigger and `decideSignIn` read them. */
async function accountMethods(authUserId: string) {
  const [row] = await pinnedTx((tx) =>
    tx.execute<{ has_password: boolean; identities: number; linked: { provider: string; relinks: boolean }[] }>(sql`
      select coalesce(u.encrypted_password, '') <> '' as has_password,
        (select count(*) from auth.identities i where i.user_id = u.id)::int as identities,
        coalesce((select json_agg(json_build_object(
            'provider', i.provider,
            'relinks', lower(split_part(u.email, '@', 2)) = any (public.provider_owned_domains(i.provider))
              and lower(i.identity_data->>'email') = lower(u.email)))
          from auth.identities i where i.user_id = u.id and i.provider in ('apple', 'google')), '[]') as linked
      from auth.users u where u.id = ${authUserId}`),
  )
  const linked = row?.linked ?? []
  const hasPassword = row?.has_password ?? false
  const state = (provider: OAuthProvider): ProviderState => {
    const own = linked.find((identity) => identity.provider === provider)
    // An `email` identity without a password signs nothing in, so only a password or another provider remains.
    const remains = hasPassword || linked.some((identity) => identity.provider !== provider)
    return {
      canUnlink: own != null && (row?.identities ?? 0) >= 2 && remains,
      linked: own != null,
      relinks: own?.relinks ?? false,
    }
  }
  return { hasPassword, providers: { apple: state('apple'), google: state('google') } }
}

const accountAddress = async (authUserId: string): Promise<Address | null> => {
  const [row] = await pinnedTx((tx) =>
    tx.execute<{ confirmed_at: null | string; email: null | string }>(
      sql`select email, email_confirmed_at::text as confirmed_at from auth.users where id = ${authUserId}`,
    ),
  )
  return row?.email == null ? null : { confirmedAt: row.confirmed_at, email: row.email }
}

/**
 * GoTrue moves the address to a remaining identity's when the unlinked one reported it, and drops its confirmation
 * when that identity reports it unverified; both stay. Only while a provider reports the moved address, so an email
 * change confirmed meanwhile is kept.
 */
async function keepAddress(authUserId: string, address: Address | null) {
  if (address == null) return
  try {
    await pinnedTx((tx) =>
      tx.execute(sql`
        update auth.users u set email = ${address.email},
          email_confirmed_at = coalesce(u.email_confirmed_at, ${address.confirmedAt}::timestamptz)
        where u.id = ${authUserId} and u.email is distinct from ${address.email}
          and exists (select 1 from auth.identities i where i.user_id = u.id and i.provider <> 'email'
            and lower(i.identity_data->>'email') = lower(u.email))`),
    )
  } catch (cause) {
    await logServerFailure('auth', `address not restored for ${authUserId}: ${String(cause)}`)
  }
}

/** Unlinks, or refuses the command; a dropped answer after GoTrue committed still unlinked it. */
async function unlinkAtGoTrue(auth: AuthServerAs, identity: UserIdentity) {
  const { error } = await auth.unlinkIdentity(identity)
  if (error == null) return
  const again = await auth.getUserIdentities()
  const still = again.data?.identities.some((candidate) => candidate.identity_id === identity.identity_id)
  if (again.error != null || still !== false) refuseCommand(await gotrueRefusal(error, 'unlink'))
}
