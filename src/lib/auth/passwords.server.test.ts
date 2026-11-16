/**
 * GoTrue test: password change, first password and sign-in normalising on the branch's GoTrue.
 * Skips visibly without the stack (always in CI).
 */
import { CONTESTED_SIGNUP } from '$lib/auth'
import { sessionCaller, writeGrant } from '$lib/auth/reauth.server'
import { supabaseAdmin } from '$lib/db/supabaseAdmin.server'
import { sql } from '$lib/db/testDb'
import { asAnonymousRequest, callForm, withLocals } from '$lib/remote/testHarness'
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { updatePasswordCommand } from '../../routes/(app)/settings/account.remote'
import { signIn } from '../../routes/(landing)/auth/(tabs)/signin/signin.remote'
import {
  createAccount as createGrnyteAccount,
  codeDevice as device,
  gotrueReachable,
  makeSocialOnly,
  publicClient,
} from './gotrue.fixture'

// grnyte's own mails go through Resend, never the stack's mail catcher: recorded here instead.
const sent = vi.hoisted(() => [] as { template: string; to: string }[])
vi.mock('$lib/email/send.server', () => ({
  sendEmail: async ({ template, to }: { template: string; to: string }) => {
    sent.push({ template, to })
    return true
  },
}))
const created: string[] = []
const address = (label: string) => `pw${label}${crypto.randomUUID().slice(0, 8)}@example.test`
const strong = () => `Pw-${crypto.randomUUID()}`

async function createAccount(email: string, init: { confirmed?: boolean; password?: string } = {}) {
  const id = await createGrnyteAccount(email, init)
  created.push(id)
  return id
}

/** Confirms, then changes the password as `locals`' device would. */
const changeAs = (locals: object, authUserId: string, password: string) =>
  withLocals(locals, async () => {
    await writeGrant(sessionCaller(), 'password.change', authUserId, 'email_code')
    return updatePasswordCommand({ password })
  })

const works = async (client: SupabaseClient) => (await client.auth.getUser()).error == null

/** `signIn` as a fresh browser would submit it, answering its result or its refusal key. */
const signInAs = (email: string, password: string) =>
  asAnonymousRequest({ auth: publicClient().auth }, () =>
    callForm<{ issues?: { message: string }[]; result?: Record<string, unknown> }>(signIn, {
      codeFlow: '1',
      email,
      password,
    }),
  ).then(
    ({ issues, result }) => result ?? JSON.parse(issues?.[0]?.message ?? '{}').message,
    (cause: { body?: { message: string } }) => JSON.parse(cause.body?.message ?? '{}').message as string,
  )

const DECOMPOSED = 'café-Pw-latte-9'

afterAll(async () => {
  if (gotrueReachable) for (const id of created) await supabaseAdmin().auth.admin.deleteUser(id)
  await sql.end()
})

describe.skipIf(!gotrueReachable)('passwords on GoTrue', { timeout: 20_000 }, () => {
  it('changes the password through the admin API: the device keeps a working session, another device is out', async () => {
    const email = address('change')
    const first = strong()
    const id = await createAccount(email, { password: first })
    const { client, locals } = await device(email)
    const other = publicClient()
    expect((await other.auth.signInWithPassword({ email, password: first })).error).toBeNull()

    const next = strong()
    const answer = (await changeAs(locals, id, next)) as { session: { access_token: string; refresh_token: string } }

    expect(await works(client)).toBe(true)
    const adopted = publicClient()
    await adopted.auth.setSession(answer.session)
    expect(await works(adopted)).toBe(true)
    expect(await works(other)).toBe(false)
    expect((await publicClient().auth.signInWithPassword({ email, password: next })).error).toBeNull()
  })

  // GoTrue's admin update sends none of its own: gotrue.contract.server.test.ts.
  it('sends its own password-changed mail', async () => {
    const email = address('notice')
    const id = await createAccount(email, { password: strong() })
    const { locals } = await device(email)

    await changeAs(locals, id, strong())

    expect(sent.filter((mail) => mail.to === email)).toEqual([{ template: 'password-changed', to: email }])
  })

  it("sets a social-only account's first password, which signs in; GoTrue adds no email identity for it", async () => {
    const email = address('social')
    const id = await createAccount(email)
    await makeSocialOnly(id, email)
    const { locals } = await device(email)

    const answer = (await changeAs(locals, id, strong())) as {
      session: { access_token: string; refresh_token: string }
    }

    const providers = await sql<{ provider: string }[]>`
      select provider from auth.identities where user_id = ${id} order by provider`
    expect(providers.map((row) => row.provider)).toEqual(['google'])
    const adopted = publicClient()
    await adopted.auth.setSession(answer.session)
    expect(await works(adopted)).toBe(true)
  })

  it('signs in a password set as U+00E9 when it is typed as "e" plus U+0301', async () => {
    const email = address('nfc')
    await createAccount(email, { password: 'café-Pw-latte-9' })

    expect(await signInAs(email, DECOMPOSED)).toHaveProperty('redirectTo')
  })

  it('neither refuses nor trims a sign-in password with a trailing space', async () => {
    const email = address('space')
    await createAccount(email, { password: 'spaced-Pw-latte-9 ' })

    expect(await signInAs(email, 'spaced-Pw-latte-9 ')).toHaveProperty('redirectTo')
    expect(await signInAs(email, 'spaced-Pw-latte-9')).toBe('auth_invalidCredentials')
  })

  it('signs in a password stored decomposed, typed that way, by retrying with the raw input', async () => {
    const email = address('raw')
    await createAccount(email, { password: DECOMPOSED })

    expect(await signInAs(email, DECOMPOSED)).toHaveProperty('redirectTo')
  })

  it('asks GoTrue once for a wrong password that is already NFC', async () => {
    const email = address('once')
    await createAccount(email, { password: strong() })
    const fetch = vi.spyOn(globalThis, 'fetch')

    expect(await signInAs(email, 'wrong-Pw-latte-9')).toBe('auth_invalidCredentials')
    expect(fetch.mock.calls.filter(([input]) => String(input).includes('/token?grant_type=password'))).toHaveLength(1)
    fetch.mockRestore()
  })

  it('keeps the contested, deleted and unconfirmed answers for a password stored decomposed', async () => {
    const contested = address('contested')
    const contestedId = await createAccount(contested, { password: DECOMPOSED })
    await supabaseAdmin().auth.admin.updateUserById(contestedId, { app_metadata: { [CONTESTED_SIGNUP]: true } })
    const deleted = address('deleted')
    const deletedId = await createAccount(deleted, { password: DECOMPOSED })
    await sql`insert into public.auth_events (auth_user_fk, kind) values (${deletedId}, 'account_deleted')`
    const unconfirmed = address('unconfirmed')
    await createAccount(unconfirmed, { confirmed: false, password: DECOMPOSED })

    expect(await signInAs(contested, DECOMPOSED)).toEqual({ redirectTo: '/auth/forgot-password?contested=1' })
    expect(await signInAs(deleted, DECOMPOSED)).toBe('auth_accountDeleted')
    expect(await signInAs(unconfirmed, DECOMPOSED)).toMatchObject({ confirm: unconfirmed })
  })
})
