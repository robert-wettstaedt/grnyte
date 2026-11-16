/**
 * The GoTrue behaviours grnyte relies on, measured on the release `GOTRUE_CONTRACT_VERSION` pins.
 * Each test names the grnyte code that breaks when it fails. `npm run test:gotrue`; skips without the stack.
 */
import { addEmailIdentity } from '$lib/auth/methods.server'
import { supabaseAdmin } from '$lib/db/supabaseAdmin.server'
import { sql } from '$lib/db/testDb'
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, describe, expect, it } from 'vitest'
import { GOTRUE_CONTRACT_VERSION } from '../../../deployment/authConfig'
import {
  codeSignedIn,
  createAccount,
  gotrueReachable,
  mailSubjects,
  makeSocialOnly,
  publicClient,
} from './gotrue.fixture'

const run = crypto.randomUUID().slice(0, 8)
const address = (label: string) => `contract${label}${run}@example.test`
const password = () => `Contract-${crypto.randomUUID()}`
const created: string[] = []
const admin = () => supabaseAdmin().auth.admin

async function account(label: string, init: { confirmed?: boolean; password?: string } = {}) {
  const email = address(label)
  const id = await createAccount(email, init)
  created.push(id)
  return { email, id }
}

async function signedIn(email: string, secret: string): Promise<SupabaseClient> {
  const client = publicClient()
  const { error } = await client.auth.signInWithPassword({ email, password: secret })
  if (error != null) throw error
  return client
}

const sessionCount = async (id: string) => (await sql`select 1 from auth.sessions where user_id = ${id}`).length
const refreshes = async (client: SupabaseClient) => (await client.auth.refreshSession()).error == null

/** Waits until `email` holds more than `seen` mails whose subject matches; their subjects. */
async function mailsTo(email: string, match: RegExp, seen = 0): Promise<string[]> {
  for (let i = 0; i < 40; i++) {
    const subjects = (await mailSubjects(email)).filter((subject) => match.test(subject))
    if (subjects.length > seen) return subjects
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`no mail matching ${match} for ${email}`)
}
const CHANGE_CODE = /^(\d+) is your grnyte email change code$/
const newestCode = async (email: string, seen = 0) =>
  CHANGE_CODE.exec((await mailsTo(email, CHANGE_CODE, seen)).at(-1)!)![1]

/** Unlinks Google on the session, behind the grant the identity guard spends; GoTrue's error. */
async function unlinkGoogle(client: SupabaseClient, id: string) {
  const session = (await client.auth.getSession()).data.session!
  const sessionId = JSON.parse(atob(session.access_token.split('.')[1])).session_id
  await sql`insert into public.reauth_grants (auth_user_fk, session_id, action, target, method, expires_at)
    values (${id}, ${sessionId}, 'identity.unlink', 'google', 'email_code', now() + interval '5 minutes')`
  const google = (await client.auth.getUserIdentities()).data?.identities.find((i) => i.provider === 'google')
  return (await client.auth.unlinkIdentity(google!)).error
}

afterAll(async () => {
  if (gotrueReachable) for (const id of created) await admin().deleteUser(id)
  await sql.end()
})

describe.skipIf(!gotrueReachable)(
  `GoTrue ${GOTRUE_CONTRACT_VERSION} behaviour contract (skipped without the branch's local GoTrue)`,
  { timeout: 20_000 },
  () => {
    // Dependent: `changePassword` (settings/account.remote.ts) mails its own notice, `noticePasswordChanged`.
    it('an admin password update sends no password-changed mail, while a change on the session does', async () => {
      const first = password()
      const { email, id } = await account('notice', { password: first })
      const PASSWORD_CHANGED = /^Your password changed$/

      expect((await (await signedIn(email, first)).auth.updateUser({ password: password() })).error).toBeNull()
      expect(await mailsTo(email, PASSWORD_CHANGED)).toHaveLength(1)

      expect((await admin().updateUserById(id, { password: password() })).error).toBeNull()
      await new Promise((resolve) => setTimeout(resolve, 1500))
      expect((await mailSubjects(email)).filter((subject) => PASSWORD_CHANGED.test(subject))).toHaveLength(1)
    })

    // Dependents: `changePassword` signs this device back in; `revokeContestedPassword` (contested.server.ts)
    // leaves the owner to recovery after its admin fallback.
    it('an admin password update ends every session of the account', async () => {
      const first = password()
      const { email, id } = await account('ends', { password: first })
      const devices = [await signedIn(email, first), await signedIn(email, first)]

      expect((await admin().updateUserById(id, { password: password() })).error).toBeNull()

      expect(await sessionCount(id)).toBe(0)
      for (const device of devices) expect(await refreshes(device)).toBe(false)
    })

    // Dependent: `revokeContestedPassword` (contested.server.ts): a recovery code mailed before its admin
    // fallback must not let the stranger back in.
    it('an admin password update spends a pending one-time code', async () => {
      const { email, id } = await account('spends', { password: password() })
      const link = await admin().generateLink({ email, type: 'recovery' })
      expect(link.error).toBeNull()

      expect((await admin().updateUserById(id, { password: password() })).error).toBeNull()

      const { error } = await publicClient().auth.verifyOtp({
        email,
        token: link.data.properties?.email_otp ?? '',
        type: 'recovery',
      })
      expect(error?.code).toBe('otp_expired')
    })

    // Dependent: `setNewPassword` (password.remote.ts), whose `signOut({ scope: 'others' })` is only a belt.
    it("setting a password on a session ends the account's other sessions and keeps this one", async () => {
      const first = password()
      const { email, id } = await account('others', { password: first })
      const [current, other] = [await signedIn(email, first), await signedIn(email, first)]

      expect((await current.auth.updateUser({ password: password() })).error).toBeNull()

      expect(await sessionCount(id)).toBe(1)
      expect(await refreshes(other)).toBe(false)
      expect(await refreshes(current)).toBe(true)
    })

    // Dependent: `signUp` (signup.remote.ts): its proof-of-work and honeypot are the only guard on its
    // admin creates; the hook refuses public sign-ups only.
    it('an admin create skips the before-user-created hook (no sign-up marker needed)', async () => {
      const email = address('unmarked')
      const unmarked = await admin().createUser({ email, email_confirm: true })
      if (unmarked.data.user != null) created.push(unmarked.data.user.id)
      expect(unmarked.error).toBeNull()
    })

    // Dependent: rule 4 of `guard_auth_identity` (drizzle/0149_auth_guards.sql) accepts the pending
    // `email_change` address, or the change of a social-only account is refused.
    it("a secure email change writes the new address's email identity before auth.users.email", async () => {
      const { email, id } = await account('order')
      await makeSocialOnly(id, email)
      const client = await codeSignedIn(email)
      const next = address('ordernext')

      expect((await client.auth.updateUser({ email: next })).error).toBeNull()
      const old = await client.auth.verifyOtp({ email, token: await newestCode(email), type: 'email_change' })
      expect(old.error).toBeNull()
      const done = await client.auth.verifyOtp({ email: next, token: await newestCode(next), type: 'email_change' })
      expect(done.error).toBeNull()
      expect(done.data.user?.email).toBe(next)
      const providers = await sql<{ provider: string }[]>`
        select provider from auth.identities where user_id = ${id} order by provider`
      expect(providers.map((row) => row.provider)).toEqual(['email', 'google'])
    })

    // Dependent: `addEmailIdentity` (methods.server.ts), or a provider-only account with a password cannot remove it.
    it('setting a password on a provider-only account, on the session or by admin, writes no email identity', async () => {
      const { email, id } = await account('pwonly')
      await makeSocialOnly(id, email)
      const client = await codeSignedIn(email)

      expect((await client.auth.updateUser({ password: password() })).error).toBeNull()
      expect((await admin().updateUserById(id, { password: password() })).error).toBeNull()
      const providers = await sql<{ provider: string }[]>`select provider from auth.identities where user_id = ${id}`
      expect(providers.map((row) => row.provider)).toEqual(['google'])
    })

    it('takes the email identity `addEmailIdentity` writes: the provider unlinks and the password signs in', async () => {
      const { email, id } = await account('pwunlink')
      await makeSocialOnly(id, email)
      const client = await codeSignedIn(email)
      const secret = password()
      expect((await client.auth.updateUser({ password: secret })).error).toBeNull()
      await addEmailIdentity(id)

      expect(await unlinkGoogle(client, id)).toBeNull()
      expect(await refreshes(await signedIn(email, secret))).toBe(true)
    })

    // Dependent: `unlinkProvider` (identities.server.ts) puts the address back after an unlink.
    it("unlinking the identity that reports the account's address moves the address to another identity's", async () => {
      const { email, id } = await account('moves')
      await makeSocialOnly(id, email)
      const other = address('movesapple')
      await sql.begin(async (tx) => {
        await tx`select set_config('grnyte.auth_user_created', ${id}, true)`
        await tx`insert into auth.identities (user_id, provider, provider_id, identity_data, created_at, updated_at)
          values (${id}, 'apple', ${crypto.randomUUID()}, ${tx.json({ email: other })}, now(), now())`
      })
      const client = await codeSignedIn(email)

      expect(await unlinkGoogle(client, id)).toBeNull()
      const [row] = await sql<{ email: string }[]>`select email from auth.users where id = ${id}`
      expect(row.email).toBe(other)
    })

    // Dependent: the settings email screen (settings/email/+page.svelte), whose resend starts over at the
    // current address's code; `confirmEmailChangeCode` answers `next` until both count.
    it('an email change resend mints new codes for both addresses and resets both confirmations', async () => {
      const { email, id } = await account('resend')
      const client = await codeSignedIn(email)
      const next = address('resendnext')

      expect((await client.auth.updateUser({ email: next })).error).toBeNull()
      const first = await newestCode(email)
      expect((await client.auth.verifyOtp({ email, token: first, type: 'email_change' })).error).toBeNull()

      // Past GoTrue's per-user minute between change mails.
      await sql`update auth.users set email_change_sent_at = now() - interval '2 minutes' where id = ${id}`
      expect((await client.auth.updateUser({ email: next })).error).toBeNull()

      const fresh = await newestCode(next, 1)
      const single = await client.auth.verifyOtp({ email: next, token: fresh, type: 'email_change' })
      expect(single.error).toBeNull()
      expect(single.data.session).toBeNull()
      expect((await client.auth.verifyOtp({ email, token: first, type: 'email_change' })).error).not.toBeNull()
      const done = await client.auth.verifyOtp({ email, token: await newestCode(email, 1), type: 'email_change' })
      expect(done.error).toBeNull()
      expect(done.data.user?.email).toBe(next)
    })

    // Dependent: `gotrueRefusal` (mail.server.ts) tells the wait from the send limit by this message.
    it('a second send to one address within its wait answers 429 over_email_send_rate_limit, "only request this after N seconds"', async () => {
      const { email } = await account('wait', { password: password() })
      expect((await publicClient().auth.resetPasswordForEmail(email)).error).toBeNull()

      const { error } = await publicClient().auth.resetPasswordForEmail(email)

      expect(error?.status).toBe(429)
      expect(error?.code).toBe('over_email_send_rate_limit')
      expect(error?.message).toMatch(/only request this after \d+ seconds/)
    })

    // Dependents: `CodeEntry`'s `length={8}` and the 10-minute `CODE_LIFETIME_MS` in
    // `auth/index.ts`; `assertAuthConfig` asserts the same settings on the hosted project.
    it('mails 8-digit codes that expire after 10 minutes', async () => {
      const { email, id } = await account('length', { password: password() })
      const codeAged = async (seconds: number) => {
        const link = await admin().generateLink({ email, type: 'recovery' })
        await sql`update auth.users set recovery_sent_at = now() - make_interval(secs => ${seconds}) where id = ${id}`
        return link.data.properties?.email_otp ?? ''
      }

      const stale = await codeAged(601)
      expect(stale).toMatch(/^\d{8}$/)
      expect((await publicClient().auth.verifyOtp({ email, token: stale, type: 'recovery' })).error?.code).toBe(
        'otp_expired',
      )
      const fresh = await codeAged(590)
      expect((await publicClient().auth.verifyOtp({ email, token: fresh, type: 'recovery' })).error).toBeNull()
    })
  },
)
