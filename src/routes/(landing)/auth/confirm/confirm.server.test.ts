/** The legacy emailed links: a contested confirmation replaces the password. */
import { CONTESTED_SIGNUP } from '$lib/auth'
import { deleteAccountRows } from '$lib/db/testAccounts'
import { deleteStaleFixtureAccounts, fixtureRun, reachable, sql } from '$lib/db/testDb'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from './+server'

const RUN = fixtureRun()

const EMAIL = `__confirm_alert_${RUN}__@example.test`
const USERNAME = `ca${RUN}`
const MINTED = { access_token: 'minted.access', refresh_token: 'minted-refresh' }

/** What the handler did: admin changes, codes minted, codes verified, sessions held. */
const adminCalls: { app_metadata?: Record<string, unknown>; id: string; password?: string }[] = []
const minted: { email: string; type: string }[] = []
const verifiedCodes: { email: string; token: string; type: string }[] = []
const held: unknown[] = []
const ended: string[] = []
const fails = { admin: false, hold: false, link: false, verify: false }

vi.mock('$app/server', () => ({ getRequestEvent: () => ({ getClientAddress: () => '203.0.113.9' }) }))
vi.mock('$lib/db/supabaseAdmin.server', () => ({
  supabaseAdmin: () => ({
    auth: {
      admin: {
        generateLink: async (params: { email: string; type: string }) => {
          minted.push(params)
          return fails.link
            ? { data: { properties: null }, error: { code: 'unexpected_failure', message: 'down' } }
            : { data: { properties: { email_otp: '24681357' } }, error: null }
        },
        signOut: async (accessToken: string) => {
          ended.push(accessToken)
          return { error: null }
        },
        updateUserById: async (
          id: string,
          attributes: { app_metadata?: Record<string, unknown>; password?: string },
        ) => {
          adminCalls.push({ id, ...attributes })
          return { error: fails.admin ? { code: 'unexpected_failure', message: 'down' } : null }
        },
      },
    },
  }),
}))
vi.mock('$lib/auth/server/authServer.server', () => ({
  supabaseAuthServer: () => ({
    verifyOtp: async (params: { email: string; token: string; type: string }) => {
      verifiedCodes.push(params)
      return fails.verify
        ? { data: { session: null }, error: { code: 'otp_expired', message: 'expired' } }
        : { data: { session: MINTED }, error: null }
    },
  }),
}))

let authUserId = ''

/** Where the handler redirected. A `+server.ts` throws Kit's redirect rather than returning it. */
async function locationOf(run: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await run()
    return undefined
  } catch (thrown) {
    const { location, status } = (thrown ?? {}) as { location?: string; status?: number }
    if (status !== 303) throw thrown
    return location
  }
}

const confirm = (
  type: string,
  verified: boolean,
  appMetadata: Record<string, unknown> = {},
  { claims = null as null | object, next = '/', query = 'token_hash=abc' } = {},
) =>
  locationOf(
    () =>
      GET({
        locals: {
          claims,
          supabase: {
            auth: {
              refreshSession: async () => ({ error: null }),
              setSession: async (session: unknown) => {
                held.push(session)
                return { error: fails.hold ? { code: 'session_not_found', message: 'gone' } : null }
              },
              verifyOtp: async () =>
                verified
                  ? { data: { user: { app_metadata: appMetadata, email: EMAIL, id: authUserId } }, error: null }
                  : { data: { user: null }, error: { code: 'otp_expired' } },
            },
          },
        },
        url: new URL(`http://localhost/auth/confirm?${query}&type=${type}&next=${encodeURIComponent(next)}`),
      } as never) as Promise<unknown>,
  )

const cleanup = async () => {
  await deleteStaleFixtureAccounts('__confirm_')
  const ids = await sql<{ id: string }[]>`select id from auth.users where email = ${EMAIL}`
  await deleteAccountRows(
    sql,
    ids.map((row) => row.id),
  )
  await sql`delete from auth.users where email = ${EMAIL}`
}

beforeAll(async () => {
  if (!reachable) return
  await cleanup()
  const [{ id }] = await sql<{ id: string }[]>`
    insert into auth.users (id, email) values (gen_random_uuid(), ${EMAIL}) returning id`
  authUserId = id
  await sql`insert into public.users (auth_user_fk, username) values (${id}, ${USERNAME})`
})

beforeEach(() => {
  adminCalls.length = 0
  minted.length = 0
  verifiedCodes.length = 0
  held.length = 0
  ended.length = 0
  Object.assign(fails, { admin: false, hold: false, link: false, verify: false })
})

afterAll(async () => {
  if (reachable) await cleanup()
})

describe.skipIf(!reachable)('GET /auth/confirm', () => {
  it('leaves an uncontested sign-up its password', async () => {
    expect(await confirm('signup', true)).toBe('/auth/continue?next=%2F')
    expect(adminCalls).toEqual([])
    expect(minted).toEqual([])
  })

  it('ends a verified link with a content next on /auth/continue', async () => {
    expect(await confirm('signup', true, {}, { next: '/routes/1' })).toBe('/auth/continue?next=%2Froutes%2F1')
  })

  it('ends a signed-in arrival without a token on /auth/continue', async () => {
    expect(await confirm('email_change', false, {}, { claims: {}, next: '/routes/1', query: 'x=1' })).toBe(
      '/auth/continue?next=%2Froutes%2F1',
    )
  })

  it('sends the dashboard invite straight to its set-password step under /auth', async () => {
    expect(await confirm('invite', true, {}, { next: '/auth/reset-password' })).toBe('/auth/reset-password')
  })

  it('keeps a content next on the contested branch', async () => {
    expect(await confirm('signup', true, { [CONTESTED_SIGNUP]: true }, { next: '/routes/1' })).toBe(
      `/auth/reset-password?contested=1&next=%2Froutes%2F1`,
    )
  })

  it('replaces a contested password by admin, then holds a fresh code session for the owner', async () => {
    expect(await confirm('signup', true, { [CONTESTED_SIGNUP]: true })).toBe(
      `/auth/reset-password?contested=1&next=%2F`,
    )
    // One admin change: no password notice is mailed, and the flag goes with it.
    expect(adminCalls).toEqual([
      { app_metadata: { [CONTESTED_SIGNUP]: null }, id: authUserId, password: expect.stringMatching(/^.{40,}$/) },
    ])
    expect(minted).toEqual([{ email: EMAIL, type: 'magiclink' }])
    expect(verifiedCodes).toEqual([{ email: EMAIL, token: '24681357', type: 'email' }])
    expect(held).toEqual([MINTED])
    // The first sign-up's username stays: the latest is no likelier to be the owner's.
    expect(
      await sql`select 1 from public.users where auth_user_fk = ${authUserId} and username = ${USERNAME}`,
    ).toHaveLength(1)
  })

  it('sends the owner to recovery and mints no code when the admin change fails', async () => {
    fails.admin = true
    expect(await confirm('signup', true, { [CONTESTED_SIGNUP]: true })).toBe(
      `/auth/forgot-password?contested=1&next=%2F`,
    )
    expect(minted).toEqual([])
    expect(held).toEqual([])
  })

  it.each(['link', 'verify', 'hold'] as const)(
    'sends the owner to recovery when the code session fails at %s',
    async (step) => {
      fails[step] = true
      expect(await confirm('signup', true, { [CONTESTED_SIGNUP]: true })).toBe(
        `/auth/forgot-password?contested=1&next=%2F`,
      )
      expect(adminCalls).toHaveLength(1)
      // A minted session nobody could hold is ended, not left live.
      expect(ended).toEqual(step === 'hold' ? [MINTED.access_token] : [])
    },
  )

  it('revokes a contested password confirmed through a magic link too', async () => {
    expect(await confirm('magiclink', true, { [CONTESTED_SIGNUP]: true })).toBe(
      `/auth/reset-password?contested=1&next=%2F`,
    )
    expect(adminCalls).toHaveLength(1)
  })

  it('sends a failed verification to the error page', async () => {
    expect(await confirm('signup', false)).toContain('/auth/error')
  })
})
