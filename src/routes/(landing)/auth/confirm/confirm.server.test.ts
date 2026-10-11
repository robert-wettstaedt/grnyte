/**
 * Admins hear about a sign-up when its email is confirmed, once, and never from another link type.
 */
import { CONTESTED_SIGNUP } from '$lib/auth'
import { deleteAccountRows } from '$lib/db/testAccounts'
import { deleteStaleFixtureAccounts, fixtureRun, reachable, sql } from '$lib/db/testDb'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from './+server'

const RUN = fixtureRun()

const EMAIL = `__confirm_alert_${RUN}__@example.test`
const USERNAME = `ca${RUN}`

const alerted: string[] = []
vi.mock('$lib/entities/notification/signup.server', () => ({
  notifyAdminsOfSignup: async ({ username }: { username: string }) => {
    alerted.push(username)
  },
}))

/** What the handler changed, through the session and through the admin API. */
const passwords: string[] = []
const adminCalls: { app_metadata?: Record<string, unknown>; id: string; password?: string }[] = []
let sessionUpdateFails = false
let refreshes = 0
let adminPasswordFails = false
let clearFails = false
vi.mock('$lib/db/supabaseAdmin.server', () => ({
  supabaseAdmin: () => ({
    auth: {
      admin: {
        updateUserById: async (
          id: string,
          attributes: { app_metadata?: Record<string, unknown>; password?: string },
        ) => {
          adminCalls.push({ id, ...attributes })
          const fails = attributes.password != null ? adminPasswordFails : clearFails
          return { error: fails ? { code: 'unexpected_failure' } : null }
        },
      },
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

const confirm = (type: string, verified: boolean, appMetadata: Record<string, unknown> = {}) =>
  locationOf(
    () =>
      GET({
        locals: {
          claims: null,
          supabase: {
            auth: {
              refreshSession: async () => {
                refreshes += 1
                return { error: null }
              },
              updateUser: async ({ password }: { password: string }) => {
                passwords.push(password)
                return { error: sessionUpdateFails ? { code: 'reauthentication_needed' } : null }
              },
              verifyOtp: async () =>
                verified
                  ? { data: { user: { app_metadata: appMetadata, id: authUserId } }, error: null }
                  : { data: { user: null }, error: { code: 'otp_expired' } },
            },
          },
        },
        url: new URL(`http://localhost/auth/confirm?token_hash=abc&type=${type}&next=/`),
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
  alerted.length = 0
  passwords.length = 0
  refreshes = 0
  adminCalls.length = 0
  sessionUpdateFails = false
  adminPasswordFails = false
  clearFails = false
})

afterAll(async () => {
  if (reachable) await cleanup()
})

describe.skipIf(!reachable)('GET /auth/confirm', () => {
  it('alerts admins once when a sign-up confirms', async () => {
    expect(await confirm('signup', true)).toBe('http://localhost/')
    expect(alerted).toEqual([USERNAME])
  })

  it('leaves an uncontested sign-up its password', async () => {
    await confirm('signup', true)
    expect(passwords).toEqual([])
    expect(adminCalls).toEqual([])
  })

  it('replaces a contested password and sends the inbox owner to pick a new one', async () => {
    expect(await confirm('signup', true, { [CONTESTED_SIGNUP]: true })).toBe(
      `/auth/reset-password?contested=1&next=%2F`,
    )
    expect(passwords).toEqual([expect.stringMatching(/^.{40,}$/)])
    // The token still carries the flag `verifyAccessToken` refuses, so a fresh one is minted.
    expect(refreshes).toBe(1)
    expect(adminCalls).toEqual([{ app_metadata: { [CONTESTED_SIGNUP]: null }, id: authUserId }])
    // The first sign-up's username stays: the latest is no likelier to be the owner's.
    expect(
      await sql`select 1 from public.users where auth_user_fk = ${authUserId} and username = ${USERNAME}`,
    ).toHaveLength(1)
  })

  it('falls back to the admin API when the session cannot change the password, and keeps the flag until then', async () => {
    sessionUpdateFails = true
    expect(await confirm('signup', true, { [CONTESTED_SIGNUP]: true })).toBe(
      `/auth/forgot-password?contested=1&next=%2F`,
    )
    expect(adminCalls).toEqual([
      { id: authUserId, password: expect.stringMatching(/^.{40,}$/) },
      { app_metadata: { [CONTESTED_SIGNUP]: null }, id: authUserId },
    ])
  })

  it('keeps the flag when no password change succeeded', async () => {
    sessionUpdateFails = true
    adminPasswordFails = true
    await confirm('signup', true, { [CONTESTED_SIGNUP]: true })
    expect(adminCalls.filter((call) => call.app_metadata != null)).toEqual([])
    expect(refreshes).toBe(0)
  })

  it('sends the owner to recovery when the flag could not be cleared, since sign-in still refuses them', async () => {
    clearFails = true
    expect(await confirm('signup', true, { [CONTESTED_SIGNUP]: true })).toBe(
      `/auth/forgot-password?contested=1&next=%2F`,
    )
  })

  it('revokes a contested password confirmed through a magic link too', async () => {
    expect(await confirm('magiclink', true, { [CONTESTED_SIGNUP]: true })).toBe(
      `/auth/reset-password?contested=1&next=%2F`,
    )
    expect(passwords).toHaveLength(1)
  })

  it('does not alert for an email change', async () => {
    await confirm('email_change', true)
    expect(alerted).toEqual([])
  })

  it('does not alert when verification fails', async () => {
    expect(await confirm('signup', false)).toContain('/auth/error')
    expect(alerted).toEqual([])
  })
})
