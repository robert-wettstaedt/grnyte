/**
 * `signUp` creates accounts through the admin API only after its checks, never reveals an existing
 * address, and leaves the confirmation email to GoTrue's resend.
 */
import { deleteAccountRows } from '$lib/db/testAccounts'
import { deleteStaleFixtureAccounts, fixtureRun, reachable, sql } from '$lib/db/testDb'
import { solvedProofOfWork } from '$lib/forms/proofOfWorkFixture'
import { asAnonymousRequest, callForm } from '$lib/remote/testHarness'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { signUp } from './signup.remote'

const RUN = fixtureRun()

const NEW = `__signup_new_${RUN}__@example.test`
const USERNAME = `su${RUN}`

let created: string[] = []
let resent: string[] = []
let resendError: null | { code: string; message: string } = null
/** What the fake admin API answers: a real auth.users id, or a GoTrue error code. */
let adminAnswer: { code: string } | { id: string } = { code: 'unset' }

vi.mock('$lib/db/supabaseAdmin.server', () => ({
  supabaseAdmin: () => ({
    auth: {
      admin: {
        createUser: async ({ email }: { email: string }) => {
          created.push(email)
          return 'id' in adminAnswer
            ? { data: { user: { id: adminAnswer.id } }, error: null }
            : { data: { user: null }, error: { code: adminAnswer.code } }
        },
      },
    },
  }),
}))

const alerted: string[] = []
vi.mock('$lib/entities/notification/signup.server', () => ({
  notifyAdminsOfSignup: async ({ username }: { username: string }) => {
    alerted.push(username)
  },
}))

const supabase = {
  auth: {
    resend: async ({ email }: { email: string }) => {
      resent.push(email)
      return { error: resendError }
    },
  },
}

interface Outcome {
  issues?: { message: string }[]
  result?: unknown
}

const FIELDS = { confirmPassword: 'correct-horse', email: NEW, password: 'correct-horse', username: USERNAME }
const nonces: string[] = []

const submitRaw = (data: Record<string, unknown>) => asAnonymousRequest(supabase, () => callForm<Outcome>(signUp, data))

const submit = async (data: Record<string, unknown>) => {
  const { encoded, nonce } = await solvedProofOfWork()
  nonces.push(nonce)
  return submitRaw({ altcha: encoded, ...data })
}

/** The message keys a refusal carries. */
const refusals = ({ issues = [] }: Outcome) => issues.map((issue) => JSON.parse(issue.message).message)

const cleanup = async () => {
  await deleteStaleFixtureAccounts('__signup_')
  const ids = await sql<{ id: string }[]>`select id from auth.users where email = ${NEW}`
  await deleteAccountRows(
    sql,
    ids.map((row) => row.id),
  )
  await sql`delete from auth.users where email = ${NEW}`
}

beforeEach(async () => {
  created = []
  resent = []
  resendError = null
  if (reachable) await cleanup()
})

afterAll(async () => {
  if (!reachable) return
  await cleanup()
  await sql`delete from public.spent_challenges where nonce = any(${nonces})`
})

describe('signUp', () => {
  it('answers a filled honeypot with success and creates nothing', async () => {
    const { result } = await submitRaw({ ...FIELDS, hpcheck: 'https://spam.example' })
    expect(result).toEqual({ success: true })
    expect(created).toEqual([])
    expect(resent).toEqual([])
  })

  it('screens the sign-up before GoTrue: no solve, no account', async () => {
    expect(refusals(await submitRaw(FIELDS))).toEqual(['auth_verificationFailed'])
    expect(created).toEqual([])
  })
})

describe.skipIf(!reachable)('signUp through the admin API', () => {
  it('creates the account and its profile, then has GoTrue send the confirmation', async () => {
    const [{ id }] = await sql<{ id: string }[]>`
      insert into auth.users (id, email) values (gen_random_uuid(), ${NEW}) returning id`
    adminAnswer = { id }

    expect((await submit(FIELDS)).result).toEqual({ success: true })

    expect(created).toEqual([NEW])
    expect(resent).toEqual([NEW])
    // Admins hear about it on confirmation, not here.
    expect(alerted).toEqual([])
    const rows = await sql`
      select 1 from public.users u join public.user_settings s on s.id = u.user_settings_fk
      where u.auth_user_fk = ${id} and u.username = ${USERNAME}`
    expect(rows).toHaveLength(1)
  })

  it('answers an address that already has an account exactly like a new one', async () => {
    adminAnswer = { code: 'email_exists' }

    expect(await submit(FIELDS)).toMatchObject({ result: { success: true } })

    expect(resent).toEqual([NEW])
    expect(await sql`select 1 from public.users where username = ${USERNAME}`).toHaveLength(0)
  })

  it('does not show an existing address that its confirmation was mailed a minute ago', async () => {
    adminAnswer = { code: 'email_exists' }
    resendError = { code: 'over_email_send_rate_limit', message: 'rate limited' }
    expect(await submit(FIELDS)).toMatchObject({ result: { success: true } })
  })

  it('still shows a new account that its confirmation could not be sent', async () => {
    const [{ id }] = await sql<{ id: string }[]>`
      insert into auth.users (id, email) values (gen_random_uuid(), ${NEW}) returning id`
    adminAnswer = { id }
    resendError = { code: 'over_email_send_rate_limit', message: 'rate limited' }
    expect(refusals(await submit(FIELDS))).toEqual(['auth_rateLimited'])
  })

  it('maps any other GoTrue refusal onto the form', async () => {
    adminAnswer = { code: 'weak_password' }
    expect(refusals(await submit(FIELDS))).toEqual(['auth_passwordWeak'])
    expect(resent).toEqual([])
  })
})
