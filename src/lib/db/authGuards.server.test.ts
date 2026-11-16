/** The SQL guards of migration 0149 on the CI shim: identity trigger rules and the sign-up hook. */
import { SIGNUP_MARKER } from '$lib/auth'
import type { TransactionSql } from 'postgres'
import { afterAll, describe, expect, it } from 'vitest'
import { reachable, sql } from './testDb'

type Tx = TransactionSql

const ROLLBACK = new Error('rollback')

/** Runs `fn` in a transaction that is always rolled back, so no fixture outlives its test. */
async function rolledBack(fn: (tx: Tx) => Promise<void>): Promise<void> {
  try {
    await sql.begin(async (tx) => {
      await fn(tx)
      throw ROLLBACK
    })
  } catch (error) {
    if (error !== ROLLBACK) throw error
  }
}

const run = crypto.randomUUID().slice(0, 8)
const address = (local: string, domain: string) => `${local}-${run}@${domain}`

/** An account, with the created-user marker cleared again so the trigger sees a later transaction. */
async function account(tx: Tx, email: string, confirmed = true): Promise<string> {
  const [row] = await tx<{ id: string }[]>`
    insert into auth.users (id, email, email_confirmed_at)
    values (gen_random_uuid(), ${email}, ${confirmed ? new Date() : null}) returning id`
  await tx`select set_config('grnyte.auth_user_created', '', true)`
  return row.id
}

async function grant(tx: Tx, userId: string, action: string, target: string): Promise<void> {
  await tx`
    insert into public.reauth_grants (auth_user_fk, session_id, action, target, method, expires_at)
    values (${userId}, gen_random_uuid(), ${action}, ${target}, 'email_code', now() + interval '5 minutes')`
}

/** Inserts an identity; `asFixture` sets the created-user marker so the trigger lets it through. */
async function insertIdentity(
  tx: Tx,
  userId: string,
  provider: string,
  email: string,
  { asFixture = false, providerId = crypto.randomUUID() as string } = {},
): Promise<string> {
  if (asFixture) await tx`select set_config('grnyte.auth_user_created', ${userId}, true)`
  const [row] = await tx<{ id: string }[]>`
    insert into auth.identities (user_id, provider, provider_id, identity_data)
    values (${userId}, ${provider}, ${providerId}, ${tx.json({ email })}) returning id`
  if (asFixture) await tx`select set_config('grnyte.auth_user_created', '', true)`
  return row.id
}

const grantCount = async (tx: Tx, userId: string) =>
  (await tx<{ n: number }[]>`select count(*)::int as n from public.reauth_grants where auth_user_fk = ${userId}`)[0].n

/** 'ok', or 'refused' for the trigger's 42501; anything else throws. */
async function outcome(tx: Tx, write: (sp: Tx) => Promise<unknown>): Promise<'ok' | 'refused'> {
  try {
    await tx.savepoint((sp) => write(sp))
    return 'ok'
  } catch (error) {
    if ((error as { code?: string }).code === '42501') return 'refused'
    throw error
  }
}

const tryInsert = (tx: Tx, userId: string, provider: string, email: string, providerId?: string) =>
  outcome(tx, (sp) => insertIdentity(sp, userId, provider, email, { providerId }))

afterAll(() => sql.end())

describe.skipIf(!reachable)('guard_auth_identity', () => {
  /** A confirmed account at example.org with a `google` identity added as a fixture. */
  async function withGoogle(tx: Tx) {
    const email = address('ana', 'example.org')
    const userId = await account(tx, email)
    const identityId = await insertIdentity(tx, userId, 'google', email, { asFixture: true })
    const unlink = () => outcome(tx, (sp) => sp`delete from auth.identities where id = ${identityId}`)
    return { email, unlink, userId }
  }

  it('refuses removing a sign-in method without an unlink grant', () =>
    rolledBack(async (tx) => {
      const { unlink } = await withGoogle(tx)
      expect(await unlink()).toBe('refused')
    }))

  it('removes it with an unlink grant for that provider, and spends the grant', () =>
    rolledBack(async (tx) => {
      const { unlink, userId } = await withGoogle(tx)
      await grant(tx, userId, 'identity.unlink', 'google')
      expect(await unlink()).toBe('ok')
      expect(await grantCount(tx, userId)).toBe(0)
    }))

  it('refuses it with an unlink grant for another provider or a link grant', () =>
    rolledBack(async (tx) => {
      const { unlink, userId } = await withGoogle(tx)
      await grant(tx, userId, 'identity.unlink', 'apple')
      await grant(tx, userId, 'identity.link', 'google')
      expect(await unlink()).toBe('refused')
      expect(await grantCount(tx, userId)).toBe(2)
    }))

  it('lets an identity onto an unconfirmed account but not onto a confirmed one', () =>
    rolledBack(async (tx) => {
      const unconfirmed = await account(tx, address('una', 'example.org'), false)
      const confirmed = await account(tx, address('con', 'example.org'))
      expect(await tryInsert(tx, unconfirmed, 'google', address('other', 'gmail.com'))).toBe('ok')
      expect(await tryInsert(tx, confirmed, 'google', address('other', 'gmail.com'))).toBe('refused')
    }))

  it("lets an account delete cascade to the account's identities", () =>
    rolledBack(async (tx) => {
      const { userId } = await withGoogle(tx)
      expect(await outcome(tx, (sp) => sp`delete from auth.users where id = ${userId}`)).toBe('ok')
    }))

  it('lets one statement delete several such accounts', () =>
    rolledBack(async (tx) => {
      const ids = [(await withGoogle(tx)).userId, (await withGoogle(tx)).userId]
      expect(await outcome(tx, (sp) => sp`delete from auth.users where id = any(${ids}::uuid[])`)).toBe('ok')
    }))

  it("auto-links a provider at its own domain only when it reports the account's address", () =>
    rolledBack(async (tx) => {
      const gmail = address('ana', 'gmail.com')
      const ana = await account(tx, gmail)
      expect(await tryInsert(tx, ana, 'google', gmail)).toBe('ok')
      expect(await tryInsert(tx, ana, 'google', gmail.replace('ana', 'Ana').replace('gmail', 'GMail'))).toBe('ok')
      expect(await tryInsert(tx, ana, 'google', address('bob', 'gmail.com'))).toBe('refused')

      const icloud = address('ana', 'icloud.com')
      expect(await tryInsert(tx, await account(tx, icloud), 'google', icloud)).toBe('refused')
      const other = address('ana', 'example.org')
      expect(await tryInsert(tx, await account(tx, other), 'google', other)).toBe('refused')
      const relay = address('ana', 'privaterelay.appleid.com')
      expect(await tryInsert(tx, await account(tx, relay), 'apple', relay)).toBe('ok')
    }))

  it("lets GoTrue's email identity for the account's own address onto a social-only account", () =>
    rolledBack(async (tx) => {
      const { email, userId } = await withGoogle(tx)
      expect(await tryInsert(tx, userId, 'email', address('else', 'example.org'))).toBe('refused')
      expect(await tryInsert(tx, userId, 'email', email)).toBe('ok')
    }))

  it('lets the email identity for a pending email change in', () =>
    rolledBack(async (tx) => {
      const { userId } = await withGoogle(tx)
      const next = address('next', 'example.org')
      await tx`update auth.users set email_change = ${next} where id = ${userId}`
      expect(await tryInsert(tx, userId, 'email', next)).toBe('ok')
    }))

  it('takes a link grant only for the exact identity it is bound to', () =>
    rolledBack(async (tx) => {
      const { userId } = await withGoogle(tx)
      const reported = address('ana', 'example.org')
      await grant(tx, userId, 'identity.link', 'google:sub-a')
      expect(await tryInsert(tx, userId, 'google', reported, 'sub-b')).toBe('refused')
      expect(await tryInsert(tx, userId, 'google', reported, 'sub-a')).toBe('ok')
      expect(await grantCount(tx, userId)).toBe(0)
    }))

  it('takes no unbound link grant', () =>
    rolledBack(async (tx) => {
      const { userId } = await withGoogle(tx)
      await grant(tx, userId, 'identity.link', 'google')
      expect(await tryInsert(tx, userId, 'google', address('ana', 'example.org'), 'sub-a')).toBe('refused')
    }))

  it('refuses moving an identity to another confirmed account, but not a profile update', () =>
    rolledBack(async (tx) => {
      const { userId } = await withGoogle(tx)
      const other = await account(tx, address('bob', 'example.org'))
      const move = () =>
        outcome(tx, (sp) => sp`update auth.identities set user_id = ${other} where user_id = ${userId}`)
      const touch = () =>
        outcome(tx, (sp) => sp`update auth.identities set identity_data = '{"name":"Ana"}' where user_id = ${userId}`)
      expect(await move()).toBe('refused')
      expect(await touch()).toBe('ok')
    }))
})

describe.skipIf(!reachable)('before_user_created_hook', () => {
  const hook = async (appMetadata: Record<string, string>) =>
    (
      await sql<{ answer: unknown }[]>`
        select public.before_user_created_hook(${sql.json({ user: { app_metadata: appMetadata } })}) as answer`
    )[0].answer

  it('allows Apple and Google sign-ups', async () => {
    expect(await hook({ provider: 'apple' })).toEqual({})
    expect(await hook({ provider: 'google' })).toEqual({})
  })

  it("allows an email sign-up carrying grnyte's marker", async () => {
    expect(await hook({ provider: 'email', ...SIGNUP_MARKER })).toEqual({})
  })

  it('refuses any other email sign-up', async () => {
    expect(await hook({ provider: 'email' })).toEqual({
      error: { http_code: 403, message: 'Signup is not allowed' },
    })
  })
})
