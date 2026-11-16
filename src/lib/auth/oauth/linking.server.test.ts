import { deleteAccountRows } from '$lib/db/testAccounts'
import { reachable, sql } from '$lib/db/testDb'
import { afterAll, describe, expect, it } from 'vitest'
import { decideSignIn } from './linking.server'

const run = crypto.randomUUID().slice(0, 8)
const address = (local: string, domain: string) => `__oauth_${local}-${run}@${domain}`
const created: string[] = []

/** A committed account (decideSignIn reads on its own connection), optionally with an identity. */
async function account(
  email: string,
  { confirmed = true, identity }: { confirmed?: boolean; identity?: [string, string] } = {},
) {
  await sql.begin(async (tx) => {
    const [row] = await tx<{ id: string }[]>`
      insert into auth.users (id, email, email_confirmed_at)
      values (gen_random_uuid(), ${email}, ${confirmed ? new Date() : null}) returning id`
    created.push(row.id)
    if (identity == null) return
    // The created-user marker lets a fixture identity past the trigger.
    await tx`select set_config('grnyte.auth_user_created', ${row.id}, true)`
    await tx`
      insert into auth.identities (user_id, provider, provider_id, identity_data)
      values (${row.id}, ${identity[0]}, ${identity[1]}, ${tx.json({ email })})`
  })
}

afterAll(async () => {
  if (reachable) await deleteAccountRows(sql, created)
})

describe.skipIf(!reachable)('decideSignIn', () => {
  it('knows an identity it has seen', async () => {
    const email = address('known', 'example.org')
    await account(email, { identity: ['google', `sub-known-${run}`] })

    expect(await decideSignIn('google', { email, sub: `sub-known-${run}` })).toEqual({ kind: 'known' })
  })

  it('answers new for an address no account has', async () => {
    expect(await decideSignIn('google', { email: address('nobody', 'example.org'), sub: `s1-${run}` })).toEqual({
      kind: 'new',
    })
  })

  it('lets GoTrue take an unconfirmed account over', async () => {
    const email = address('unconfirmed', 'example.org')
    await account(email, { confirmed: false })

    expect(await decideSignIn('google', { email, sub: `s2-${run}` })).toEqual({ kind: 'unconfirmed' })
  })

  it('refuses a confirmed account at example.org, whatever the case of the address', async () => {
    const email = address('confirmed', 'example.org')
    await account(email)

    expect(await decideSignIn('google', { email: email.toUpperCase(), sub: `s3-${run}` })).toEqual({ kind: 'refuse' })
  })

  it.each([
    ['google', 'gmail.com'],
    ['google', 'googlemail.com'],
    ['apple', 'icloud.com'],
    ['apple', 'me.com'],
    ['apple', 'mac.com'],
    ['apple', 'privaterelay.appleid.com'],
  ] as const)('lets %s link a confirmed account at its own %s', async (provider, domain) => {
    const email = address(`own-${provider}`, domain)
    await account(email)

    expect(await decideSignIn(provider, { email: email.toUpperCase(), sub: `s4-${domain}-${run}` })).toEqual({
      kind: 'providerDomain',
    })
  })

  it('refuses gmail.com through Apple', async () => {
    const email = address('gmail-apple', 'gmail.com')
    await account(email)

    expect(await decideSignIn('apple', { email, sub: `s5-${run}` })).toEqual({ kind: 'refuse' })
  })
})
