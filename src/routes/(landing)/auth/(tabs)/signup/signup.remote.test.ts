/**
 * `signUp` creates accounts through the admin API only after its checks, never reveals an existing
 * address, and leaves the confirmation code to GoTrue's resend.
 */
import { CONTESTED_SIGNUP, SIGNUP_MARKER } from '$lib/auth'
import { issueResendToken } from '$lib/auth/contested.server'
import { deleteAccountRows } from '$lib/db/testAccounts'
import { deleteStaleFixtureAccounts, fixtureRun, reachable, sql } from '$lib/db/testDb'
import { solvedProofOfWork } from '$lib/forms/proofOfWorkFixture'
import { asAnonymousRequest, callForm, refusalKeys } from '$lib/remote/testHarness'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { resendSignupCode, signUp } from './signup.remote'

const RUN = fixtureRun()

const NEW = `__signup_new_${RUN}__@example.test`
const OTHER = `__signup_other_${RUN}__@example.test`

type GoTrueError = { code: string; message: string; status: number }
let created: unknown[] = []
let flagged: { claimed: unknown; id: string }[] = []
let resent: string[] = []
let mailed: { template: string; text: string; to: string }[] = []
let resendError: GoTrueError | null = null
let flagError: GoTrueError | null = null
/** What the fake admin API answers: a real auth.users id, or a GoTrue error. */
let adminAnswer: Omit<GoTrueError, 'message'> | { id: string } = { code: 'unset', status: 500 }

// The confirmation goes out through the auth-only client, so GoTrue's per-IP limit sees the visitor.
vi.mock('$lib/auth/authServer.server', () => ({
  supabaseAuthServer: () => ({
    resend: async ({ email }: { email: string }) => {
      resent.push(email)
      return { error: resendError }
    },
  }),
}))

vi.mock('$lib/email/send.server', () => ({
  sendEmail: async (input: { body: string[]; footnote: string; template: string; to: string }) => {
    mailed.push({ template: input.template, text: [...input.body, input.footnote].join(' '), to: input.to })
    return true
  },
}))

vi.mock('$lib/db/supabaseAdmin.server', () => ({
  supabaseAdmin: () => ({
    auth: {
      admin: {
        createUser: async ({ app_metadata, email }: { app_metadata: unknown; email: string }) => {
          created.push({ app_metadata, email })
          return 'id' in adminAnswer
            ? { data: { user: { id: adminAnswer.id } }, error: null }
            : { data: { user: null }, error: { ...adminAnswer, message: 'refused' } }
        },
        updateUserById: async (id: string, { app_metadata }: { app_metadata: Record<string, unknown> }) => {
          flagged.push({ claimed: app_metadata[CONTESTED_SIGNUP], id })
          return { error: flagError }
        },
      },
    },
  }),
}))

const supabase = { auth: {} }

interface Outcome {
  issues?: { message: string }[]
  result?: unknown
}

const FIELDS = { confirmPassword: 'correct-horse', email: NEW, password: 'correct-horse' }
const SUCCESS = { email: expect.any(String), resendToken: expect.any(String), success: true }
const nonces: string[] = []

const solved = async () => {
  const { encoded, nonce } = await solvedProofOfWork()
  nonces.push(nonce)
  return encoded
}
const submitRaw = (data: Record<string, unknown>) => asAnonymousRequest(supabase, () => callForm<Outcome>(signUp, data))
const submit = async (data: Record<string, unknown>) => submitRaw({ altcha: await solved(), ...data })
const resend = async (data: Record<string, unknown>) =>
  asAnonymousRequest(supabase, () => callForm<Outcome>(resendSignupCode, data))

const refusals = refusalKeys

const unconfirmed = async (email = NEW) =>
  (await sql<{ id: string }[]>`insert into auth.users (id, email) values (gen_random_uuid(), ${email}) returning id`)[0]
    .id

const cleanup = async () => {
  await deleteStaleFixtureAccounts('__signup_')
  const ids = await sql<{ id: string }[]>`select id from auth.users where email = any(${[NEW, OTHER]})`
  await deleteAccountRows(
    sql,
    ids.map((row) => row.id),
  )
  await sql`delete from public.auth_code_attempts where subject = any(${[NEW, OTHER]})`
  await sql`delete from auth.users where email = any(${[NEW, OTHER]})`
}

beforeEach(async () => {
  created = []
  flagged = []
  resent = []
  mailed = []
  resendError = null
  flagError = null
  if (reachable) await cleanup()
})

afterAll(async () => {
  if (!reachable) return
  await cleanup()
  await sql`delete from public.spent_challenges where nonce = any(${nonces})`
  await sql`delete from public.client_error_logs where error like ${'[signup-contested] flag failed for %: signup_test_flag'}`
})

describe('signUp', () => {
  it('answers a filled honeypot with success and creates nothing', async () => {
    const { result } = await submitRaw({ ...FIELDS, hpcheck: 'https://spam.example' })
    expect(result).toEqual(SUCCESS)
    expect(created).toEqual([])
    expect(resent).toEqual([])
  })

  it('screens the sign-up before GoTrue: no solve, no account', async () => {
    expect(refusals(await submitRaw(FIELDS))).toEqual(['auth_verificationFailed'])
    expect(created).toEqual([])
  })
})

describe.skipIf(!reachable)('signUp through the admin API', () => {
  it('creates only the marked GoTrue account, then has GoTrue send the code', async () => {
    const id = await unconfirmed()
    adminAnswer = { id }

    expect((await submit(FIELDS)).result).toEqual(SUCCESS)

    expect(created).toEqual([{ app_metadata: SIGNUP_MARKER, email: NEW }])
    expect(resent).toEqual([NEW])
    expect(await sql`select 1 from public.users where auth_user_fk = ${id}`).toHaveLength(0)
    expect(await sql`select 1 from public.user_settings where auth_user_fk = ${id}`).toHaveLength(0)
  })

  it('answers an address that already has an account exactly like a new one', async () => {
    adminAnswer = { code: 'email_exists', status: 422 }

    expect((await submit(FIELDS)).result).toEqual(SUCCESS)
    expect(resent).toEqual([NEW])
  })

  it('marks an unconfirmed account signed up for twice, so confirming it forces a new password', async () => {
    const id = await unconfirmed()
    adminAnswer = { code: 'email_exists', status: 422 }

    expect((await submit({ ...FIELDS, email: NEW.toUpperCase() })).result).toEqual(SUCCESS)
    expect(flagged).toEqual([{ claimed: true, id }])
  })

  it('sends no confirmation when the flag does not land, and answers the same', async () => {
    const id = await unconfirmed()
    adminAnswer = { code: 'email_exists', status: 422 }
    flagError = { code: 'signup_test_flag', message: 'admin api down', status: 500 }

    expect((await submit(FIELDS)).result).toEqual(SUCCESS)
    expect(flagged).toEqual([{ claimed: true, id }])
    expect(resent).toEqual([])
  })

  it('sends no code for a confirmed address, but a notice naming how it signs in, once a minute', async () => {
    const [{ id }] = await sql<{ id: string }[]>`
      insert into auth.users (id, email, email_confirmed_at, encrypted_password)
      values (gen_random_uuid(), ${NEW}, now(), 'hash') returning id`
    await sql`
      insert into auth.identities (user_id, provider, provider_id, identity_data, email)
      values (${id}, 'email', ${id}, ${sql.json({ email: NEW })}, ${NEW})`
    adminAnswer = { code: 'email_exists', status: 422 }

    expect((await submit(FIELDS)).result).toEqual(SUCCESS)
    expect((await submit(FIELDS)).result).toEqual(SUCCESS)

    expect(resent).toEqual([])
    expect(flagged).toEqual([])
    expect(mailed).toEqual([{ template: 'already-has-account', text: expect.stringContaining('password'), to: NEW }])
  })

  it('does not show an existing address that its confirmation was mailed a minute ago', async () => {
    adminAnswer = { code: 'email_exists', status: 422 }
    resendError = { code: 'over_email_send_rate_limit', message: 'rate limited', status: 429 }
    expect((await submit(FIELDS)).result).toEqual(SUCCESS)
  })

  it('shows a new account that its code could not be sent', async () => {
    adminAnswer = { id: await unconfirmed() }
    resendError = { code: 'over_email_send_rate_limit', message: 'rate limited', status: 429 }
    expect(refusals(await submit(FIELDS))).toEqual(['auth_mailUnavailable'])
  })

  it('logs a GoTrue rate limit with one stable message and asks the person to try later', async () => {
    adminAnswer = { id: await unconfirmed() }
    resendError = {
      code: 'over_request_rate_limit',
      message: 'Request rate limit reached for 198.51.100.7',
      status: 429,
    }
    // Logging dedupes by message, so an earlier row would hide this one.
    await sql`delete from public.client_error_logs where error like '[auth] GoTrue rate limit hit%'`

    expect(refusals(await submit(FIELDS))).toEqual(['auth_tooManyTries'])
    const logged = await sql<{ error: string }[]>`
      select error from public.client_error_logs where error like '[auth] GoTrue rate limit hit%'`
    expect(logged.map((row) => row.error)).toEqual(['[auth] GoTrue rate limit hit (resend)'])
  })

  it.each([
    [{ code: 'weak_password', status: 422 }, 'auth_passwordWeak'],
    [{ code: 'unexpected_failure', status: 503 }, 'auth_serviceUnavailable'],
    [{ code: 'signup_disabled', status: 403 }, 'auth_signupRefused'],
  ])('maps the GoTrue refusal %o onto the form', async (answer, key) => {
    adminAnswer = answer
    expect(refusals(await submit(FIELDS))).toEqual([key])
    expect(resent).toEqual([])
  })
})

describe.skipIf(!reachable)('resendSignupCode', () => {
  it('refuses without a fresh solve, and sends nothing for a filled honeypot', async () => {
    await unconfirmed()
    expect(refusals(await resend({ email: NEW }))).toEqual(['auth_verificationFailed'])
    expect((await resend({ altcha: await solved(), email: NEW, hpcheck: 'x' })).result).toEqual({ success: true })
    expect(resent).toEqual([])
  })

  it("re-sends without flagging when it carries the sign-up's token for this address", async () => {
    await unconfirmed()
    const resendToken = issueResendToken(NEW)

    expect((await resend({ altcha: await solved(), email: NEW, resendToken })).result).toEqual({ success: true })
    expect(resent).toEqual([NEW])
    expect(flagged).toEqual([])
  })

  it.each([
    ['no token', () => undefined],
    ['a token for another address', () => issueResendToken(OTHER)],
    ['an expired token', () => issueResendToken(NEW, Date.now() - 8 * 24 * 60 * 60 * 1000)],
  ])('flags the account first with %s', async (_name, token) => {
    const id = await unconfirmed()

    await resend({ altcha: await solved(), email: NEW, resendToken: token() })
    expect(flagged).toEqual([{ claimed: true, id }])
    expect(resent).toEqual([NEW])
  })
})
