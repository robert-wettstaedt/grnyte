import { getRequestEvent } from '$app/server'
import { PROVIDER_NAMES } from '$lib/auth'
import type { AuthServerAs } from '$lib/auth/authServer.server'
import { recordAuthEvent } from '$lib/auth/events.server'
import { gotrueRefusal } from '$lib/auth/mail.server'
import { notForwarding } from '$lib/auth/mailForwarding.server'
import { accountMethods, signInMethods } from '$lib/auth/methods.server'
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

/** The account's address while Apple no longer forwards mail to it, else null. Never null itself: a form gate waits on it. */
export async function mailForwardingQuery() {
  const { sub } = await requireLiveSession()
  const [current, methods] = await Promise.all([accountAddress(sub), signInMethods(sub)])
  const off = current == null ? false : (await notForwarding([current.email])).has(current.email)
  return { address: off ? (current?.email ?? null) : null, appleLinked: methods.providers.includes('apple'), id: sub }
}

export async function signInMethodsQuery() {
  const { sub } = await requireLiveSession()
  return { ...accountMethods(await signInMethods(sub)), configured: configuredProviders(getRequestEvent()) }
}

/** Removes a provider behind an `identity.unlink` grant, which the identity trigger spends. */
export async function unlinkProvider({ provider }: { provider: OAuthProvider }) {
  const caller = await reauthCaller()
  const auth = callerAuthServer()
  const refuseIfLast = async () => {
    if (!accountMethods(await signInMethods(caller.authUserId)).providers[provider].canUnlink) {
      refuseCommand(formError('settings_signInMethodsLastMethod', { provider: PROVIDER_NAMES[provider] }))
    }
  }
  await refuseIfLast()
  if (!(await hasGrant(caller, 'identity.unlink', provider))) refuseCommand(formError('auth_reauthRequired'))

  const listed = await auth.getUserIdentities()
  if (listed.error != null) refuseCommand(await gotrueRefusal(listed.error, 'identities'))
  const identity = listed.data?.identities.find((candidate) => candidate.provider === provider)
  // Already gone (another device): the screen's next read shows it.
  if (identity == null) return { othersSignedOut: false }

  const address = await accountAddress(caller.authUserId)
  try {
    // Another removal committed first, so the identity trigger refused GoTrue: say why, not "unavailable".
    await unlinkAtGoTrue(auth, identity, refuseIfLast)
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
async function unlinkAtGoTrue(auth: AuthServerAs, identity: UserIdentity, beforeRefusing: () => Promise<void>) {
  const { error } = await auth.unlinkIdentity(identity)
  if (error == null) return
  const again = await auth.getUserIdentities()
  const still = again.data?.identities.some((candidate) => candidate.identity_id === identity.identity_id)
  if (again.error != null || still !== false) {
    await beforeRefusing()
    refuseCommand(await gotrueRefusal(error, 'unlink'))
  }
}
