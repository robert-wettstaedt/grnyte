/** GoTrue tests for migration 0149 and the branch's GoTrue settings, on its local second stack. */
import { supabaseAdmin } from '$lib/db/supabaseAdmin.server'
import { sql } from '$lib/db/testDb'
import { afterAll, describe, expect, it } from 'vitest'
import { codeSignedIn, createAccount as createGrnyteAccount, gotrueReachable, publicClient } from './gotrue.fixture'

const run = crypto.randomUUID().slice(0, 8)
const address = (label: string) => `__gotrue_guard_${label}_${run}@grnyte.test`
const password = () => `Guard-${crypto.randomUUID()}`
const created: string[] = []

async function createAccount(label: string, init: { confirmed?: boolean; password?: string } = {}) {
  const email = address(label)
  const id = await createGrnyteAccount(email, init)
  created.push(id)
  return { email, id }
}

/** Swaps the account's email identity for a `google` one, under the created-user marker. */
async function makeSocialOnly(userId: string, email: string): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`select set_config('grnyte.auth_user_created', ${userId}, true)`
    await tx`delete from auth.identities where user_id = ${userId}`
    await tx`
      insert into auth.identities (user_id, provider, provider_id, identity_data, created_at, updated_at, last_sign_in_at)
      values (${userId}, 'google', ${crypto.randomUUID()}, ${tx.json({ email })}, now(), now(), now())`
  })
}

const signedIn = codeSignedIn

const identities = async (userId: string) =>
  (
    await sql<{ provider: string }[]>`select provider from auth.identities where user_id = ${userId} order by provider`
  ).map((row) => row.provider)

afterAll(async () => {
  if (gotrueReachable) {
    for (const id of created) await supabaseAdmin().auth.admin.deleteUser(id)
  }
  await sql.end()
})

describe.skipIf(!gotrueReachable)(
  "GoTrue guards on the branch's local stack (skipped without it); the hook does not run for admin creates",
  () => {
    it('refuses a public sign-up and a sign-up by code with the publishable key', async () => {
      const signUp = await publicClient().auth.signUp({ email: address('public'), password: password() })
      if (signUp.data.user != null) created.push(signUp.data.user.id)
      expect(signUp.error?.message).toBe('Signup is not allowed')

      const byCode = await publicClient().auth.signInWithOtp({
        email: address('otp'),
        options: { shouldCreateUser: true },
      })
      expect(byCode.error?.message).toBe('Signup is not allowed')
    })

    it("creates grnyte's own accounts, and admin creates without the marker too", async () => {
      const { id } = await createAccount('marked')
      expect(id).toBeTruthy()

      const unmarked = await supabaseAdmin().auth.admin.createUser({ email: address('unmarked'), email_confirm: true })
      if (unmarked.data.user != null) created.push(unmarked.data.user.id)
      expect(unmarked.error).toBeNull()
    })

    it('deletes confirmed and unconfirmed accounts that hold a social identity', async () => {
      for (const confirmed of [true, false]) {
        const { email, id } = await createAccount(`delete_${confirmed}`, { confirmed })
        await makeSocialOnly(id, email)

        const { error } = await supabaseAdmin().auth.admin.deleteUser(id)
        expect(error).toBeNull()
        expect(await sql`select 1 from auth.users where id = ${id}`).toHaveLength(0)
      }
    })

    it('asks a session older than a day for the nonce before a new password', async () => {
      const current = password()
      const { email, id } = await createAccount('stale', { password: current })
      const client = publicClient()
      const signIn = await client.auth.signInWithPassword({ email, password: current })
      expect(signIn.error).toBeNull()
      await sql`update auth.sessions set created_at = now() - interval '25 hours' where user_id = ${id}`

      const { error } = await client.auth.updateUser({ password: password() })
      expect(error?.code).toBe('reauthentication_needed')
    })

    it('lets a social-only account set its first password and change its address by both codes', async () => {
      const { email, id } = await createAccount('social')
      await makeSocialOnly(id, email)
      const client = await signedIn(email)

      const first = await client.auth.updateUser({ password: password() })
      expect(first.error).toBeNull()

      const next = address('social_next')
      expect((await client.auth.updateUser({ email: next })).error).toBeNull()
      const admin = supabaseAdmin().auth.admin
      const current = await admin.generateLink({ email, newEmail: next, type: 'email_change_current' })
      const incoming = await admin.generateLink({ email, newEmail: next, type: 'email_change_new' })
      const old = await client.auth.verifyOtp({
        email,
        token: current.data.properties?.email_otp ?? '',
        type: 'email_change',
      })
      expect(old.error).toBeNull()
      const done = await client.auth.verifyOtp({
        email: next,
        token: incoming.data.properties?.email_otp ?? '',
        type: 'email_change',
      })
      expect(done.error).toBeNull()
      expect(done.data.user?.email).toBe(next)
      // The final verify adds the email identity (rule 4's pending-address case).
      expect(await identities(id)).toEqual(['email', 'google'])
    })
  },
)
