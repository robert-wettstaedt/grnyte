import { command, getRequestEvent, query } from '$app/server'
import { IDENTITY_TARGETS } from '$lib/auth'
import { hasRecentAppleRevocation, recordAuthEvent } from '$lib/auth/events.server'
import { gotrueRefusal } from '$lib/auth/mail.server'
import { configuredProviders, type OAuthProvider } from '$lib/auth/oauth/providers.server'
import { hasGrant, reauthCaller } from '$lib/auth/reauth.server'
import { requireLiveSession } from '$lib/auth/session.server'
import { pinnedTx } from '$lib/db/pinned.server'
import { formError } from '$lib/forms/schemas'
import * as z from '$lib/forms/zod'
import { refuseCommand } from '$lib/remote/authed.server'
import { sql } from 'drizzle-orm'

interface ProviderState {
  canUnlink: boolean
  linked: boolean
  /** The next "Continue with" re-links it on its own: the provider owns the address and reports it. */
  relinks: boolean
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

/** How the caller can sign in, and which providers this origin offers. */
export const signInMethodsQuery = query(async () => {
  const { sub } = await requireLiveSession()
  return { ...(await accountMethods(sub)), configured: configuredProviders(getRequestEvent()) }
})

/** Removes a provider behind an `identity.unlink` grant, which the identity trigger spends. */
export const unlinkProvider = command(z.object({ provider: z.enum(IDENTITY_TARGETS) }), async ({ provider }) => {
  const caller = await reauthCaller()
  const { supabase } = getRequestEvent().locals
  if (!(await accountMethods(caller.authUserId)).providers[provider].canUnlink) {
    refuseCommand(formError('settings_signInMethodsLastMethod'))
  }
  if (!(await hasGrant(caller, 'identity.unlink', provider))) refuseCommand(formError('auth_reauthRequired'))

  const listed = await supabase.auth.getUserIdentities()
  if (listed.error != null) refuseCommand(await gotrueRefusal(listed.error, 'identities'))
  const identity = listed.data?.identities.find((candidate) => candidate.provider === provider)
  // Already gone (another device): the screen's next read shows it.
  if (identity == null) return { othersSignedOut: false }

  const { error } = await supabase.auth.unlinkIdentity(identity)
  if (error != null) {
    // A dropped answer after GoTrue committed still unlinked it.
    const again = await supabase.auth.getUserIdentities()
    const still = again.data?.identities.some((candidate) => candidate.identity_id === identity.identity_id)
    if (again.error != null || still !== false) refuseCommand(await gotrueRefusal(error, 'unlink'))
  }

  await recordAuthEvent('identity_unlinked', { authUserId: caller.authUserId, detail: { provider } })
  if (provider === 'apple' && !(await hasRecentAppleRevocation(caller.authUserId, 'identity.unlink', 'apple'))) {
    await recordAuthEvent('apple_revoke_skipped', {
      authUserId: caller.authUserId,
      detail: { action: 'identity.unlink', target: 'apple' },
    })
  }
  const others = await supabase.auth.signOut({ scope: 'others' })
  return { othersSignedOut: others.error == null }
})
