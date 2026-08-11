// @vitest-environment node
/**
 * Who gets told about a sign-up, and what they get told through.
 *
 * The recipient half runs against a real database, because it is a query: only a row in
 * `user_roles` makes somebody an app admin, and a rule that merely reads plausible would quietly
 * mail every user in the table. The delivery half is mocked, since the two things worth proving
 * about it are decisions, not transport: push wins when it lands, and mail is the fallback for
 * every way it can fail to (push covered in `push.server.test.ts`, mail in `shell.test.ts`).
 *
 * Skipped when DATABASE_URL is unreachable so `npm test` still passes without one.
 */
import { createThrowawayUser, dropThrowawayUser, reachable, sql, type SeedUser } from '$lib/db/testDb'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const sendPushToUser = vi.fn<() => Promise<boolean>>()
const sendEmail = vi.fn<() => Promise<boolean>>()

vi.mock('./push.server', () => ({
  sendPushToUser: (...args: unknown[]) => sendPushToUser(...(args as [])),
  subscriptionsFor: () => Promise.resolve([]),
}))

vi.mock('$lib/email/send.server', () => ({
  sendEmail: (...args: unknown[]) => sendEmail(...(args as [])),
}))

const { notifyAdminsOfSignup } = await import('./signup.server')

let admin = {} as SeedUser
let other = {} as SeedUser

beforeAll(async () => {
  if (!reachable) return

  admin = await createThrowawayUser('signup_admin')
  other = await createThrowawayUser('signup_other')

  await sql`insert into user_roles (auth_user_fk, role) values (${admin.authId}, 'app_admin')`
})

afterAll(async () => {
  if (!reachable) return

  await sql`delete from user_roles where auth_user_fk = ${admin.authId}`
  await dropThrowawayUser(admin)
  await dropThrowawayUser(other)
  await sql.end()
})

beforeEach(() => {
  sendPushToUser.mockReset()
  sendEmail.mockReset()
  sendEmail.mockResolvedValue(true)
})

describe.skipIf(!reachable)('notifyAdminsOfSignup', () => {
  it('pushes to app admins only, and does not mail when the push landed', async () => {
    sendPushToUser.mockResolvedValue(true)

    await notifyAdminsOfSignup({ origin: 'https://grnyte.test', userFk: other.userId, username: 'newcomer' })

    const pushed = sendPushToUser.mock.calls.map((call) => (call as unknown as [unknown, number])[1])
    expect(pushed).toContain(admin.userId)
    expect(pushed).not.toContain(other.userId)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('mails the admin when the push did not go out', async () => {
    sendPushToUser.mockResolvedValue(false)

    await notifyAdminsOfSignup({ origin: 'https://grnyte.test', userFk: other.userId, username: 'newcomer' })

    const mailed = sendEmail.mock.calls.map((call) => (call as unknown as [{ to: string }])[0].to)
    expect(mailed).toContain(admin.email)
    expect(mailed).not.toContain(other.email)
    expect(
      sendEmail.mock.calls.some((call) => (call as unknown as [{ subject: string }])[0].subject.includes('newcomer')),
    ).toBe(true)
  })
})
