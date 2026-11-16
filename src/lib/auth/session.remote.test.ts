// @vitest-environment node
import { reachable, seedUsers, type SeedUser } from '$lib/db/testDb'
import { formError } from '$lib/forms/schemas'
import { asAnonymousRequest, asRequest, statusOf } from '$lib/remote/testHarness'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { sendPasswordReset } from './session.remote'

let user: SeedUser

beforeAll(async () => {
  if (!reachable) return
  ;({ user } = await seedUsers({ user: 'user@grnyte.rocks' }))
})

const reset = vi.hoisted(() => ({
  error: null as null | { code: string; message: string; status: number },
  sent: [] as string[],
}))
vi.mock('$lib/auth/authServer.server', () => ({
  supabaseAuthServer: () => ({
    resetPasswordForEmail: async (email: string) => {
      reset.sent.push(email)
      return { error: reset.error }
    },
  }),
}))
beforeEach(() => {
  reset.error = null
  reset.sent = []
})
const supabase = { auth: {} }

describe.skipIf(!reachable)('sendPasswordReset', () => {
  it('mails the reset code to the address on the verified token', async () => {
    expect(await asRequest(user.authId, () => sendPasswordReset(), supabase)).toEqual({ email: 'user@grnyte.rocks' })
    expect(reset.sent).toEqual(['user@grnyte.rocks'])
  })

  it('tells a signed-in caller about the rate limit instead of claiming a mail', async () => {
    reset.error = { code: 'over_email_send_rate_limit', message: 'rate limited', status: 429 }
    const outcome = await asRequest(user.authId, () => sendPasswordReset(), supabase).catch(
      (cause: { body?: unknown }) => cause.body,
    )

    expect(outcome).toEqual({ message: formError('auth_mailUnavailable') })
  })

  it('refuses a signed-out caller and mails nothing', async () => {
    expect(await statusOf(() => asAnonymousRequest(supabase, () => sendPasswordReset()))).toBe(401)
    expect(reset.sent).toEqual([])
  })
})
