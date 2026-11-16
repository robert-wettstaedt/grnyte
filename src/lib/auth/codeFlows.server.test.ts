/**
 * GoTrue test: the mailed-code flows end to end on the branch's GoTrue, codes read from its mail
 * catcher. Skips visibly without the stack (always in CI).
 */
import { sessionCaller, writeGrant } from '$lib/auth/reauth.server'
import { verifyAccessToken } from '$lib/auth/verify.server'
import { sql } from '$lib/db/testDb'
import { solvedProofOfWork } from '$lib/forms/proofOfWorkFixture'
import { asAnonymousRequest, callForm, withLocals } from '$lib/remote/testHarness'
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { confirmEmailChangeCode, updateEmailCommand } from '../../routes/(app)/settings/account.remote'
import { confirmSignupCode, resendSignupCode, signUp } from '../../routes/(landing)/auth/(tabs)/signup/signup.remote'
import { confirmResetCode, forgotPassword } from '../../routes/(landing)/auth/forgot-password/forgot-password.remote'
import { gotrueReachable, publicClient } from './gotrue.fixture'
import { setNewPassword } from './password.remote'

const INBUCKET = 'http://127.0.0.1:19010/api/v1/mailbox'
const STRANGER = 'stranger-password-1'
const OWNER = 'owner-password-2'
const created: string[] = []

const address = (label: string) => {
  const box = `codes${label}${crypto.randomUUID().slice(0, 8)}`
  created.push(`${box}@example.test`)
  return `${box}@example.test`
}

/** The newest code mailed to `email`, once more than `seen` mails arrived. */
async function codeFor(email: string, seen = 0): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const mails = (await (await fetch(`${INBUCKET}/${email.split('@')[0]}`)).json()) as { subject: string }[]
    if (mails.length > seen) return /^(\d{8}) /.exec(mails.at(-1)!.subject)![1]
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`no code mailed to ${email}`)
}
const mailCount = async (email: string) =>
  ((await (await fetch(`${INBUCKET}/${email.split('@')[0]}`)).json()) as unknown[]).length

const solved = async () => (await solvedProofOfWork()).encoded
const anonymous = <T>(client: SupabaseClient, fn: () => Promise<T>) => asAnonymousRequest({ auth: client.auth }, fn)
const signUpSolved = async (email: string, password: string) =>
  (
    await anonymous(publicClient(), async () =>
      callForm<{ result?: { resendToken: string } }>(signUp, {
        altcha: await solved(),
        confirmPassword: password,
        email,
        password,
      }),
    )
  ).result
const refusalOf = (run: () => Promise<unknown>) =>
  run().then(
    () => undefined,
    (cause: { body?: { message: string } }) => JSON.parse(cause.body?.message ?? '{}').message as string,
  )

/** Sets the password as a code session and checks the session came from a code. */
async function choosePassword(client: SupabaseClient, password: string) {
  const { amr, run } = await setPasswordAs(client, password)
  expect(amr?.map((entry) => entry.method)).toEqual(['otp'])
  expect(await run).toEqual({ done: true })
}

async function setPasswordAs(client: SupabaseClient, password: string) {
  const { session } = (await client.auth.getSession()).data
  const verified = await verifyAccessToken(session?.access_token)
  if (!verified.ok) throw new Error(`session did not verify: ${verified.reason}`)
  return {
    amr: verified.claims.amr,
    run: withLocals({ claims: verified.claims, supabase: client }, () => setNewPassword({ password })),
  }
}

const guessWrong = async (email: string) => {
  for (let i = 0; i < 5; i++) {
    await refusalOf(() => anonymous(publicClient(), () => confirmSignupCode({ code: '00000000', email })))
  }
}

/** A confirmed account signed in on its own client, with the locals its requests carry. */
async function signedIn(email: string) {
  await signUpSolved(email, OWNER)
  const client = publicClient()
  await anonymous(client, async () => confirmSignupCode({ code: await codeFor(email), email }))
  const verified = await verifyAccessToken((await client.auth.getSession()).data.session?.access_token)
  if (!verified.ok) throw new Error(`session did not verify: ${verified.reason}`)
  const [{ id }] = await sql<{ id: string }[]>`select id from auth.users where email = ${email}`
  return { id, locals: { claims: verified.claims, supabase: client, verifiedToken: verified.token } }
}

const sessionIds = async (id: string) =>
  (await sql<{ id: string }[]>`select id from auth.sessions where user_id = ${id} order by id`).map((row) => row.id)
const addressOf = async (id: string) =>
  (await sql<{ email: string }[]>`select email from auth.users where id = ${id}`)[0].email

const signsIn = async (email: string, password: string) =>
  (await publicClient().auth.signInWithPassword({ email, password })).error == null

afterAll(async () => {
  if (!gotrueReachable) return
  await sql`delete from public.auth_code_attempts where subject = any(${created})`
  await sql`delete from auth.users where email = any(${created})`
  await sql.end()
})

describe.skipIf(!gotrueReachable)('mailed codes on GoTrue', { timeout: 20_000 }, () => {
  it('lets the inbox owner of a contested sign-up choose the password, and refuses the stranger', async () => {
    const email = address('contested')
    await signUpSolved(email, STRANGER)
    await signUpSolved(email, OWNER)
    const client = publicClient()

    const answer = await anonymous(client, async () => confirmSignupCode({ code: await codeFor(email), email }))
    expect(answer).toEqual({ next: 'choosePassword' })

    const [{ id }] = await sql<{ id: string }[]>`select id from auth.users where email = ${email}`
    await sql`insert into auth.sessions (id, user_id) values (gen_random_uuid(), ${id})`
    await choosePassword(client, OWNER)
    expect(await sql`select 1 from auth.sessions where user_id = ${id}`).toHaveLength(1)
    expect(await signsIn(email, STRANGER)).toBe(false)
    expect(await signsIn(email, OWNER)).toBe(true)
  })

  it('sends the owner through reset when the contested password could not be replaced on the session', async () => {
    const email = address('revokefails')
    await signUpSolved(email, STRANGER)
    await signUpSolved(email, OWNER)
    const client = publicClient()
    const failing = new Proxy(client.auth, {
      get: (auth, key) =>
        key === 'updateUser'
          ? async () => ({ data: { user: null }, error: { code: 'unexpected_failure', message: 'down', status: 500 } })
          : (Reflect.get(auth, key) as unknown),
    })

    const answer = await asAnonymousRequest({ auth: failing }, async () =>
      confirmSignupCode({ code: await codeFor(email), email }),
    )
    expect(answer).toEqual({ next: 'forgotPassword' })
    expect(await signsIn(email, STRANGER)).toBe(false)
  })

  it('completes a reset for an unconfirmed address with its confirmation code and replaces the stranger password', async () => {
    const email = address('unconfirmedreset')
    await signUpSolved(email, STRANGER)
    // Flags the account; GoTrue refuses the new mail inside its minute, so the first code stands.
    await anonymous(publicClient(), async () => callForm(forgotPassword, { altcha: await solved(), email }))
    const client = publicClient()

    const answer = await anonymous(client, async () => confirmResetCode({ code: await codeFor(email), email }))
    expect(answer).toEqual({ next: 'choosePassword' })
    await choosePassword(client, OWNER)
    expect(await signsIn(email, STRANGER)).toBe(false)
  })

  it('resets a confirmed address by its recovery code, and refuses a session made by password', async () => {
    const email = address('confirmedreset')
    await signUpSolved(email, OWNER)
    await anonymous(publicClient(), async () => confirmSignupCode({ code: await codeFor(email), email }))
    const before = await mailCount(email)
    await anonymous(publicClient(), async () => callForm(forgotPassword, { altcha: await solved(), email }))
    const client = publicClient()

    expect(
      await anonymous(client, async () => confirmResetCode({ code: await codeFor(email, before), email })),
    ).toEqual({ next: 'choosePassword' })
    await choosePassword(client, STRANGER)

    const byPassword = publicClient()
    await byPassword.auth.signInWithPassword({ email, password: STRANGER })
    expect(await refusalOf(async () => (await setPasswordAs(byPassword, OWNER)).run)).toBe('auth_codeExpired')
  })

  it('refuses a code session whose otp entry is 11 minutes old', async () => {
    const claims = {
      amr: [{ method: 'otp', timestamp: Math.floor(Date.now() / 1000) - 11 * 60 }],
      sub: crypto.randomUUID(),
    }
    expect(await refusalOf(() => withLocals({ claims, supabase: {} }, () => setNewPassword({ password: OWNER })))).toBe(
      'auth_codeExpired',
    )
  })

  it('lets five wrong codes reach GoTrue, then refuses the sixth try without asking it, even with the right code', async () => {
    const email = address('locked')
    await signUpSolved(email, OWNER)
    const code = await codeFor(email)
    const wrong = String((Number(code) + 1) % 1e8).padStart(8, '0')
    const verifies = vi.spyOn(globalThis, 'fetch')
    const asked = () => verifies.mock.calls.filter(([url]) => String(url).includes('/auth/v1/verify')).length

    for (let i = 0; i < 5; i++) {
      expect(await refusalOf(() => anonymous(publicClient(), () => confirmSignupCode({ code: wrong, email })))).toBe(
        'auth_codeWrong',
      )
    }
    expect(asked()).toBe(5)
    expect(await refusalOf(() => anonymous(publicClient(), () => confirmSignupCode({ code, email })))).toBe(
      'auth_codeLocked',
    )
    expect(asked()).toBe(5)
    // The sign-up code also guards an unconfirmed address's reset, which verifies the same code.
    expect(await refusalOf(() => anonymous(publicClient(), () => confirmResetCode({ code, email })))).toBe(
      'auth_codeLocked',
    )
    verifies.mockRestore()
  })

  it("leaves a confirmed owner's reset working after five wrong sign-up confirmations", async () => {
    const email = address('confirmedlock')
    await signUpSolved(email, OWNER)
    await anonymous(publicClient(), async () => confirmSignupCode({ code: await codeFor(email), email }))
    await guessWrong(email)
    const before = await mailCount(email)
    await anonymous(publicClient(), async () => callForm(forgotPassword, { altcha: await solved(), email }))

    expect(
      await anonymous(publicClient(), async () => confirmResetCode({ code: await codeFor(email, before), email })),
    ).toEqual({ next: 'choosePassword' })
  })

  it('keeps the count when GoTrue refuses a resend, and clears it when a new code goes out', async () => {
    const email = address('resend')
    const { resendToken } = (await signUpSolved(email, OWNER))!
    await guessWrong(email)
    const resend = async () =>
      anonymous(publicClient(), async () =>
        callForm<{ issues?: unknown[] }>(resendSignupCode, { altcha: await solved(), email, resendToken }),
      )

    // Inside GoTrue's 60 seconds per address: refused, so the old code and its count stand.
    expect((await resend()).issues).toHaveLength(1)
    const code = await codeFor(email)
    expect(await refusalOf(() => anonymous(publicClient(), () => confirmSignupCode({ code, email })))).toBe(
      'auth_codeLocked',
    )

    await new Promise((resolve) => setTimeout(resolve, 61_000))
    const before = await mailCount(email)
    expect((await resend()).issues).toBeUndefined()
    expect(
      await anonymous(publicClient(), async () => confirmSignupCode({ code: await codeFor(email, before), email })),
    ).toEqual({ next: 'profile' })
  }, 120_000)

  it('writes the session a confirmed code returns into the request client, where GoTrue accepts it', async () => {
    const email = address('cookie')
    await signUpSolved(email, OWNER)
    const client = publicClient()

    await anonymous(client, async () => confirmSignupCode({ code: await codeFor(email), email }))

    const { data, error } = await client.auth.getUser()
    expect(error).toBeNull()
    expect(data.user?.email).toBe(email)
  })

  it('changes the email only after a code from each address; the first answers next and signs nothing out', async () => {
    const email = address('change')
    const target = address('changeto')
    const { id, locals } = await signedIn(email)
    await sql`insert into auth.sessions (id, user_id) values (gen_random_uuid(), ${id})`
    const before = await mailCount(email)
    const confirm = (code: string, to: string) => withLocals(locals, () => confirmEmailChangeCode({ code, email: to }))

    await withLocals(locals, () => updateEmailCommand({ email: target }))
    const sessions = await sessionIds(id)
    expect(await confirm(await codeFor(email, before), email)).toEqual({ step: 'next' })
    expect(await sessionIds(id)).toEqual(sessions)
    expect(await addressOf(id)).toBe(email)

    // A grant and an open code from before the change must not count after it.
    await withLocals(locals, () => writeGrant(sessionCaller(), 'account.delete', id, 'email_code'))
    await sql`
      insert into public.reauth_challenges (action, auth_user_fk, code_hash, expires_at, session_id, target)
      values ('region.delete', ${id}, 'x', now() + interval '10 minutes', gen_random_uuid(), '1')`
    expect(await confirm(await codeFor(target), target)).toEqual({ step: 'done' })
    expect(await addressOf(id)).toBe(target)
    expect(await sessionIds(id)).toHaveLength(1)
    expect(await sql`select 1 from public.reauth_grants where auth_user_fk = ${id}`).toHaveLength(0)
    expect(await sql`select 1 from public.reauth_challenges where auth_user_fk = ${id}`).toHaveLength(0)
  })

  it('mints new codes for both addresses on a resend (GoTrue resets the confirmations), so an accepted first code counts for nothing', async () => {
    const email = address('resendchange')
    const target = address('resendto')
    const { id, locals } = await signedIn(email)
    const confirm = (code: string, to: string) => withLocals(locals, () => confirmEmailChangeCode({ code, email: to }))

    const before = await mailCount(email)
    await withLocals(locals, () => updateEmailCommand({ email: target }))
    const first = await codeFor(email, before)
    expect(await confirm(first, email)).toEqual({ step: 'next' })

    // Past GoTrue's per-user minute between change mails.
    await sql`update auth.users set email_change_sent_at = now() - interval '2 minutes' where id = ${id}`
    const [seenOld, seenNew] = [await mailCount(email), await mailCount(target)]
    await withLocals(locals, () => updateEmailCommand({ email: target }))

    expect(await confirm(await codeFor(target, seenNew), target)).toEqual({ step: 'next' })
    expect(await addressOf(id)).toBe(email)
    expect(await refusalOf(() => confirm(first, email))).toBe('auth_codeWrong')
    expect(await confirm(await codeFor(email, seenOld), email)).toEqual({ step: 'done' })
    expect(await addressOf(id)).toBe(target)
  })
})
