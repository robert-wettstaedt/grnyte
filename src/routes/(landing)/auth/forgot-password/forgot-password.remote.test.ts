/**
 * `forgotPassword` resets a confirmed account, re-confirms an unconfirmed one, and answers every caller alike.
 */
import { CONTESTED_SIGNUP } from '$lib/auth'
import { deleteStaleFixtureAccounts, fixtureRun, reachable, sql } from '$lib/db/testDb'
import { solvedProofOfWork } from '$lib/forms/proofOfWorkFixture'
import { asAnonymousRequest, callForm, refusalKeys } from '$lib/remote/testHarness'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { forgotPassword } from './forgot-password.remote'

const RUN = fixtureRun()

const CONFIRMED = `__forgot_confirmed_${RUN}__@example.test`
const UNCONFIRMED = `__forgot_unconfirmed_${RUN}__@example.test`
const UNKNOWN = `__forgot_unknown_${RUN}__@example.test`

let sent: string[] = []
let resent: string[] = []
/** Contested flags and resends, in the order they happened. */
let order: string[] = []
let unconfirmedId = ''
/** What GoTrue answers either mail with; its rate limit is one only a known address can hit. */
let resetError: null | { code: string; message: string; status: number } = null
let flagError: null | { code: string; message: string } = null
const nonces: string[] = []

vi.mock('$lib/db/supabaseAdmin.server', () => ({
  supabaseAdmin: () => ({
    auth: {
      admin: {
        updateUserById: async (id: string, { app_metadata }: { app_metadata: Record<string, unknown> }) => {
          order.push(`flag:${id}:${String(app_metadata[CONTESTED_SIGNUP])}`)
          return { error: flagError }
        },
      },
    },
  }),
}))

// The confirmation resend goes through the auth-only client; the reset mail stays on the cookie client.
vi.mock('$lib/auth/authServer.server', () => ({
  supabaseAuthServer: () => ({
    resend: async ({ email }: { email: string }) => {
      resent.push(email)
      order.push(`resend:${email}`)
      return { error: resetError }
    },
    resetPasswordForEmail: async (email: string) => {
      sent.push(email)
      return { error: resetError }
    },
  }),
}))

const quota = vi.hoisted(() => [] as unknown[])
vi.mock('$lib/auth/events.server', () => ({
  noteMailRefusal: async (error: { code?: string }) => {
    quota.push(error.code)
  },
}))

const supabase = { auth: {} }

interface Outcome {
  issues?: { message: string }[]
  result?: { email: string; success: boolean }
}

const submitRaw = (data: Record<string, unknown>) =>
  asAnonymousRequest(supabase, () => callForm<Outcome>(forgotPassword, data))

const refusals = refusalKeys

/** Submits with a fresh genuine solve, the way the widget does. */
const submit = async (data: Record<string, unknown>) => {
  const { encoded, nonce } = await solvedProofOfWork()
  nonces.push(nonce)
  const { result } = await submitRaw({ altcha: encoded, ...data })
  return result
}

const cleanup = async () => {
  await deleteStaleFixtureAccounts('__forgot_')
  await sql`delete from auth.users where email in (${CONFIRMED}, ${UNCONFIRMED})`
}

beforeAll(async () => {
  if (!reachable) return
  await cleanup()
  await sql`insert into auth.users (id, email, email_confirmed_at) values (gen_random_uuid(), ${CONFIRMED}, now())`
  const [row] = await sql`insert into auth.users (id, email) values (gen_random_uuid(), ${UNCONFIRMED}) returning id`
  unconfirmedId = row.id
})

beforeEach(() => {
  sent = []
  resent = []
  order = []
  resetError = null
  flagError = null
})

afterAll(async () => {
  if (!reachable) return
  await cleanup()
  await sql`delete from public.spent_challenges where nonce = any(${nonces})`
  await sql`delete from public.client_error_logs where error like ${'[signup-contested] flag failed for %: forgot_test_flag'}`
})

describe.skipIf(!reachable)('forgotPassword', () => {
  it('sends a reset to a confirmed account', async () => {
    expect(await submit({ email: CONFIRMED })).toEqual({ email: CONFIRMED, success: true })
    expect(sent).toEqual([CONFIRMED])
  })

  it('finds the confirmed account whatever case the address is typed in', async () => {
    await submit({ email: CONFIRMED.toUpperCase() })
    expect(sent).toHaveLength(1)
  })

  it('says the mail could not go out when GoTrue refuses the send, and records the quota', async () => {
    resetError = { code: 'over_email_send_rate_limit', message: 'rate limited', status: 429 }
    quota.length = 0
    const { encoded, nonce } = await solvedProofOfWork()
    nonces.push(nonce)
    expect(refusals(await submitRaw({ altcha: encoded, email: CONFIRMED }))).toEqual(['auth_mailUnavailable'])
    expect(quota).toEqual(['over_email_send_rate_limit'])
  })

  it('sends an unconfirmed account its confirmation again, never a reset, and answers the same', async () => {
    expect(await submit({ email: UNCONFIRMED })).toEqual({ email: UNCONFIRMED, success: true })
    expect(sent).toEqual([])
    expect(resent).toEqual([UNCONFIRMED])
  })

  it('flags the unconfirmed account contested before mailing, so confirming replaces a squatter password', async () => {
    await submit({ email: UNCONFIRMED })
    expect(order).toEqual([`flag:${unconfirmedId}:true`, `resend:${UNCONFIRMED}`])
  })

  it('sends nothing when the flag does not land, so a squatter password never survives a confirm', async () => {
    flagError = { code: 'forgot_test_flag', message: 'admin api down' }
    expect(await submit({ email: UNCONFIRMED })).toEqual({ email: UNCONFIRMED, success: true })
    expect(order).toEqual([`flag:${unconfirmedId}:true`])
  })

  it('keeps the guess counters when nothing was mailed, so the old code gets no fresh guesses', async () => {
    const subject = UNCONFIRMED.toLowerCase()
    await sql`insert into auth_code_attempts (subject, kind, tries) values (${subject}, 'signup', 4), (${subject}, 'recovery', 4)
      on conflict (subject, kind) do update set tries = 4`
    flagError = { code: 'forgot_test_flag', message: 'admin api down' }
    await submit({ email: UNCONFIRMED })
    const rows = await sql`select kind, tries from auth_code_attempts where subject = ${subject} order by kind`
    await sql`delete from auth_code_attempts where subject = ${subject}`
    expect(rows.map((r) => `${r.kind}:${r.tries}`)).toEqual(['recovery:4', 'signup:4'])
  })

  it('flags nothing for a confirmed or unknown address', async () => {
    await submit({ email: CONFIRMED })
    await submit({ email: UNKNOWN })
    expect(order).toEqual([])
  })

  it('answers a confirmed, an unconfirmed and an unknown address with the same body', async () => {
    const bodies = [
      await submit({ email: CONFIRMED }),
      await submit({ email: UNCONFIRMED }),
      await submit({ email: UNKNOWN }),
    ]
    expect(bodies.map((body) => body?.success)).toEqual([true, true, true])
    expect(bodies.map((body) => Object.keys(body ?? {}).sort())).toEqual(Array(3).fill(['email', 'success']))
  })

  it('sends nothing to an unknown address and answers the same', async () => {
    expect(await submit({ email: UNKNOWN })).toEqual({ email: UNKNOWN, success: true })
    expect(sent).toEqual([])
    expect(resent).toEqual([])
  })

  it('answers a filled honeypot like any other address and sends nothing, even to a confirmed account', async () => {
    const { result } = await submitRaw({ email: CONFIRMED, hpcheck: 'https://spam.example' })
    expect(result).toEqual({ email: CONFIRMED, success: true })
    expect(sent).toEqual([])
    expect(resent).toEqual([])
  })

  it('screens the request before GoTrue: no solve, nothing sent', async () => {
    expect(refusals(await submitRaw({ email: CONFIRMED }))).toEqual(['auth_verificationFailed'])
    expect(sent).toEqual([])
  })
})
