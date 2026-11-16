import { reachable, sql } from '$lib/db/testDb'
import { asRequest, commandRefusal } from '$lib/remote/testHarness'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { signInMethodsQuery, unlinkProvider } from './identities.remote'
import { sessionCaller, writeGrant } from './reauth.server'

vi.mock('$env/dynamic/private', async (actual) => ({
  env: {
    ...(await actual<{ env: Record<string, string> }>()).env,
    // Every provider var set, so an empty `configured` comes from the origin alone.
    ...Object.fromEntries(
      [
        'APPLE_KEY_ID',
        'APPLE_PRIVATE_KEY',
        'APPLE_SERVICES_ID',
        'APPLE_TEAM_ID',
        'GOOGLE_CLIENT_ID',
        'GOOGLE_CLIENT_SECRET',
      ].map((name) => [name, 'set']),
    ),
  },
}))

const run = crypto.randomUUID().slice(0, 8)
const ids: string[] = []
afterAll(async () => {
  if (reachable) await sql`delete from auth.users where id = any(${ids})`
})

type Method = 'apple' | 'email' | 'google'

/** A confirmed account and its identities, made in one transaction as GoTrue's sign-up makes them. */
async function account(
  local: string,
  domain: string,
  methods: { [K in Method]?: string },
  password: null | string = null,
): Promise<string> {
  const tag = `-${run}-${ids.length}@`
  const email = `${local}${tag}${domain}`
  const id = await sql.begin(async (tx) => {
    const [user] = await tx<{ id: string }[]>`
      insert into auth.users (id, email, email_confirmed_at, encrypted_password)
      values (gen_random_uuid(), ${email}, now(), ${password}) returning id`
    await tx`select set_config('grnyte.auth_user_created', ${user.id}, true)`
    for (const [provider, reported] of Object.entries(methods)) {
      await tx`insert into auth.identities (user_id, provider, provider_id, identity_data)
        values (${user.id}, ${provider}, ${crypto.randomUUID()}, ${tx.json({ email: reported.replace('@', tag) })})`
    }
    return user.id
  })
  ids.push(id)
  return id
}

/** The session client's user endpoints: what GoTrue lists before and after the unlink. */
function sessionClient(providers: Method[], { failUnlink = false, goneAfterFailure = true, movesAddressOf = '' } = {}) {
  let listed = providers.map((provider) => ({ identity_id: `id-${provider}`, provider }))
  const calls: string[] = []
  return {
    calls,
    supabase: {
      auth: {
        getUserIdentities: async () => ({ data: { identities: listed }, error: null }),
        signOut: async ({ scope }: { scope: string }) => {
          calls.push(`signOut:${scope}`)
          return { error: null }
        },
        unlinkIdentity: async ({ identity_id }: { identity_id: string }) => {
          calls.push(`unlink:${identity_id}`)
          // GoTrue's rule (gotrue.contract): the address moves to a remaining identity's.
          if (movesAddressOf !== '') {
            await sql`update auth.users u set email = i.identity_data->>'email' from auth.identities i
              where u.id = ${movesAddressOf} and i.user_id = u.id and i.provider = 'apple'`
          }
          if (!failUnlink || goneAfterFailure) listed = listed.filter((i) => i.identity_id !== identity_id)
          return { data: {}, error: failUnlink ? { message: 'dropped', status: 0 } : null }
        },
      },
    },
  }
}

const events = async (id: string, kind: string) =>
  (
    await sql<
      { n: number }[]
    >`select count(*)::int as n from public.auth_events where auth_user_fk = ${id} and kind = ${kind}`
  )[0].n

/** Confirms `identity.unlink` for `provider` on this request's session, then unlinks. */
const confirmedUnlink = (provider: 'apple' | 'google') => async () => {
  await writeGrant(sessionCaller(), 'identity.unlink', provider, 'email_code')
  return unlinkProvider({ provider })
}

describe.skipIf(!reachable)('signInMethodsQuery', () => {
  it('answers relinks only where the provider owns the address and reports it', async () => {
    const owned = await account('ana', 'gmail.com', { google: 'ana@gmail.com' })
    const foreign = await account('ana', 'example.org', { google: 'ana@example.org' })
    const reportedElse = await account('ana', 'gmail.com', { google: 'other@gmail.com' })

    const relinks = async (id: string) => (await asRequest(id, () => signInMethodsQuery())).providers.google.relinks
    expect([await relinks(owned), await relinks(foreign), await relinks(reportedElse)]).toEqual([true, false, false])
  })

  it('answers linked and canUnlink per provider, and no provider on another origin', async () => {
    const id = await account('both', 'example.org', { apple: 'a@icloud.com', google: 'a@example.org' })

    expect(await asRequest(id, () => signInMethodsQuery())).toEqual({
      configured: [],
      hasPassword: false,
      providers: {
        apple: { canUnlink: true, linked: true, relinks: false },
        google: { canUnlink: true, linked: true, relinks: false },
      },
    })
  })
})

describe.skipIf(!reachable)('unlinkProvider', () => {
  it('refuses the only identity', async () => {
    const id = await account('only', 'example.org', { google: 'only@example.org' })
    const { supabase } = sessionClient(['google'])

    expect(await commandRefusal(() => asRequest(id, confirmedUnlink('google'), supabase))).toBe(
      'settings_signInMethodsLastMethod',
    )
  })

  it('refuses when only an email identity without a password would remain', async () => {
    const id = await account('nopw', 'example.org', { email: 'nopw@example.org', google: 'nopw@example.org' })
    const { calls, supabase } = sessionClient(['email', 'google'])

    expect(await commandRefusal(() => asRequest(id, confirmedUnlink('google'), supabase))).toBe(
      'settings_signInMethodsLastMethod',
    )
    expect(calls).toEqual([])
  })

  it('refuses without an identity.unlink grant', async () => {
    const id = await account('nogrant', 'example.org', { email: 'nogrant@example.org', google: 'g@example.org' }, 'h')
    const { supabase } = sessionClient(['email', 'google'])

    expect(await commandRefusal(() => asRequest(id, () => unlinkProvider({ provider: 'google' }), supabase))).toBe(
      'auth_reauthRequired',
    )
  })

  it('unlinks, records it and signs the other devices out', async () => {
    const id = await account('ok', 'example.org', { email: 'ok@example.org', google: 'ok@example.org' }, 'hash')
    const { calls, supabase } = sessionClient(['email', 'google'])

    expect(await asRequest(id, confirmedUnlink('google'), supabase)).toEqual({ othersSignedOut: true })
    expect(calls).toEqual(['unlink:id-google', 'signOut:others'])
    expect(await events(id, 'identity_unlinked')).toBe(1)
  })

  it('counts an unlink whose answer was lost but whose identity is gone', async () => {
    const id = await account('lost', 'example.org', { email: 'lost@example.org', google: 'lost@example.org' }, 'h')
    const { calls, supabase } = sessionClient(['email', 'google'], { failUnlink: true })

    await asRequest(id, confirmedUnlink('google'), supabase)
    expect(calls).toEqual(['unlink:id-google', 'signOut:others'])
    expect(await events(id, 'identity_unlinked')).toBe(1)
  })

  it('records nothing when the failed unlink left the identity listed', async () => {
    const id = await account('kept', 'example.org', { email: 'kept@example.org', google: 'kept@example.org' }, 'h')
    const { calls, supabase } = sessionClient(['email', 'google'], { failUnlink: true, goneAfterFailure: false })

    expect(await commandRefusal(() => asRequest(id, confirmedUnlink('google'), supabase))).toBe(
      'auth_serviceUnavailable',
    )
    expect(calls).toEqual(['unlink:id-google'])
    expect(await events(id, 'identity_unlinked')).toBe(0)
  })

  it.each([
    ['no revocation', null, 1],
    ['a revocation for this unlink', 'identity.unlink', 0],
    ['a revocation for an account deletion', 'account.delete', 1],
  ])('records apple_revoke_skipped after an Apple unlink with %s', async (_case, revokedFor, skipped) => {
    const id = await account(
      'apple',
      'example.org',
      { apple: 'x@privaterelay.appleid.com', email: 'apple@example.org' },
      'h',
    )
    if (revokedFor != null) {
      await sql`insert into public.auth_events (auth_user_fk, kind, detail)
        values (${id}, 'apple_revoked', ${sql.json({ action: revokedFor, target: 'apple' })})`
    }
    const { supabase } = sessionClient(['apple', 'email'])

    await asRequest(id, confirmedUnlink('apple'), supabase)
    expect(await events(id, 'apple_revoke_skipped')).toBe(skipped)
  })

  it('keeps the address when GoTrue moves it to the remaining identity', async () => {
    const id = await account('moved', 'gmail.com', { apple: 'moved@icloud.com', google: 'moved@gmail.com' })
    const [before] = await sql<{ email: string }[]>`select email from auth.users where id = ${id}`
    const { supabase } = sessionClient(['apple', 'google'], { movesAddressOf: id })

    await asRequest(id, confirmedUnlink('google'), supabase)
    const [after] = await sql<{ email: string }[]>`select email from auth.users where id = ${id}`
    expect(after.email).toBe(before.email)
  })
})
