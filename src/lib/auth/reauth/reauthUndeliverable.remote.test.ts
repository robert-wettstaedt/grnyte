/** Asking for a re-auth code when Apple no longer forwards the account's mail: the command, against a real database. */
import { afterAll, describe, expect, it, vi } from 'vitest'

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: async () => ({ data: { id: 'sent' }, error: null }) }
  },
}))
vi.mock('$lib/email/shell', async (actual) => ({
  ...(await actual()),
  renderEmailHtml: () => '',
  renderEmailText: () => '',
}))

const { reachable, sql } = await import('$lib/db/testDb')
const { addressHash } = await import('$lib/auth/server/mailForwarding.server')
const { asRequest, commandRefusal } = await import('$lib/remote/testHarness')
const { requestReauthCode } = await import('./reauth.remote')

const run = crypto.randomUUID().slice(0, 8)
const accounts: string[] = []

/** A confirmed account at the private address Apple made, whose forwarding is off; Apple linked or not. */
async function silenced(appleLinked: boolean): Promise<string> {
  const address = `reauth-${run}-${accounts.length}@privaterelay.appleid.com`
  const id = await sql.begin(async (tx) => {
    const [user] = await tx<{ id: string }[]>`
      insert into auth.users (id, email, email_confirmed_at, encrypted_password)
      values (gen_random_uuid(), ${address}, now(), '$2a$10$hash') returning id`
    await tx`select set_config('grnyte.auth_user_created', ${user.id}, true)`
    await tx`insert into auth.identities (user_id, provider, provider_id, identity_data, created_at)
      values (${user.id}, 'email', ${user.id}, ${tx.json({ email: address })}, now())`
    if (appleLinked) {
      await tx`insert into auth.identities (user_id, provider, provider_id, identity_data, created_at)
        values (${user.id}, 'apple', ${`sub-${user.id}`}, ${tx.json({ email: address })}, now())`
    }
    await tx`insert into public.apple_mail_forwarding (auth_user_fk, address_hash, forwarding, event_at)
      values (${user.id}, ${addressHash(address)}, false, now())`
    return user.id
  })
  accounts.push(id)
  return id
}

const ask = (id: string) =>
  commandRefusal(() => asRequest(id, () => requestReauthCode({ action: 'region.delete', target: '1' })))

afterAll(async () => {
  if (reachable) await sql`delete from auth.users where id = any(${accounts})`
  await sql.end()
})

describe.skipIf(!reachable)('requestReauthCode while Apple forwards no mail to the address', () => {
  it('says no code can arrive and points to Confirm with Apple, as often as it is asked', async () => {
    const id = await silenced(true)
    const answers = []
    for (let i = 0; i < 6; i++) answers.push(await ask(id))

    expect(new Set(answers)).toEqual(new Set(['auth_mailUndeliverable']))
  })

  it('points to support when Apple is no longer linked', async () => {
    expect(await ask(await silenced(false))).toBe('auth_mailUndeliverableSupport')
  })
})
