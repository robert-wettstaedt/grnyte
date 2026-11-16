/** Sign-in methods come from the account's identities and its stored password. */
import { reachable, sql } from '$lib/db/testDb'
import { afterAll, describe, expect, it } from 'vitest'
import { signInMethods } from './methods.server'

const ids: string[] = []

/** An account and its identity in one transaction, so the identity guard sees a just-created account. */
async function account(provider: 'email' | 'google', password: null | string): Promise<string> {
  const email = `methods-${crypto.randomUUID().slice(0, 8)}@example.org`
  const id = await sql.begin(async (tx) => {
    const [user] = await tx<{ id: string }[]>`
      insert into auth.users (id, email, email_confirmed_at, encrypted_password)
      values (gen_random_uuid(), ${email}, now(), ${password}) returning id`
    await tx`
      insert into auth.identities (user_id, provider, provider_id, identity_data, email)
      values (${user.id}, ${provider}, ${crypto.randomUUID()}, ${sql.json({ email })}, ${email})`
    return user.id
  })
  ids.push(id)
  return id
}

afterAll(async () => {
  if (reachable) await sql`delete from auth.users where id = any(${ids})`
})

describe.skipIf(!reachable)('signInMethods', () => {
  it('answers a password-only account', async () => {
    expect(await signInMethods(await account('email', '$2a$10$hash'))).toEqual({
      hasPassword: true,
      identities: 1,
      providers: ['email'],
      relinks: [],
    })
  })

  it('answers a Google account without a password', async () => {
    expect(await signInMethods(await account('google', null))).toEqual({
      hasPassword: false,
      identities: 1,
      providers: ['google'],
      relinks: [],
    })
  })
})
