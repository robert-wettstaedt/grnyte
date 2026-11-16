/** GoTrue tests for migration 0149 and the branch's GoTrue settings, on its local second stack. */
import { supabaseAdmin } from '$lib/db/supabaseAdmin.server'
import { sql } from '$lib/db/testDb'
import { afterAll, describe, expect, it } from 'vitest'
import {
  codeSignedIn,
  createAccount as createGrnyteAccount,
  gotrueReachable,
  makeSocialOnly,
  publicClient,
} from './gotrue.fixture'

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

afterAll(async () => {
  if (gotrueReachable) {
    for (const id of created) await supabaseAdmin().auth.admin.deleteUser(id)
  }
  await sql.end()
})

describe.skipIf(!gotrueReachable)(
  // The GoTrue behaviours these rely on (hook skipped by admin creates, email change order) are in gotrue.contract.
  "GoTrue guards on the branch's local stack (skipped without it)",
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

    it("creates grnyte's own accounts", async () => {
      const { id } = await createAccount('marked')
      expect(id).toBeTruthy()
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

    it('lets a social-only account set its first password', async () => {
      const { email, id } = await createAccount('social')
      await makeSocialOnly(id, email)
      const client = await codeSignedIn(email)

      expect((await client.auth.updateUser({ password: password() })).error).toBeNull()
    })
  },
)
