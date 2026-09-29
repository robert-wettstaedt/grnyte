/**
 * Admins hear about a sign-up when its email is confirmed, once, and never from another link type.
 */
import { deleteAccountRows } from '$lib/db/testAccounts'
import { reachable, sql } from '$lib/db/testDb'
import { redirectOf } from '$lib/remote/testHarness'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from './+server'

const EMAIL = '__confirm_alert__@example.test'
const USERNAME = 'confirmalert'

const alerted: string[] = []
vi.mock('$lib/entities/notification/signup.server', () => ({
  notifyAdminsOfSignup: async ({ username }: { username: string }) => {
    alerted.push(username)
  },
}))

let authUserId = ''

const confirm = (type: string, verified: boolean) =>
  redirectOf(
    () =>
      GET({
        locals: {
          claims: null,
          supabase: {
            auth: {
              verifyOtp: async () =>
                verified
                  ? { data: { user: { id: authUserId } }, error: null }
                  : { data: { user: null }, error: { code: 'otp_expired' } },
            },
          },
        },
        url: new URL(`http://localhost/auth/confirm?token_hash=abc&type=${type}&next=/`),
      } as never) as Promise<unknown>,
  )

const cleanup = async () => {
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
})

afterAll(async () => {
  if (reachable) await cleanup()
})

describe.skipIf(!reachable)('GET /auth/confirm', () => {
  it('alerts admins once when a sign-up confirms', async () => {
    expect(await confirm('signup', true)).toBe('http://localhost/')
    expect(alerted).toEqual([USERNAME])
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
