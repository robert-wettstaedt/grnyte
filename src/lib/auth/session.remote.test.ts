// @vitest-environment node
import { reachable, seedUsers, type SeedUser } from '$lib/db/testDb'
import { formError } from '$lib/forms/schemas'
import { asAnonymousRequest, asRequest, statusOf } from '$lib/remote/testHarness'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { sendPasswordReset } from './session.remote'

let user: SeedUser

beforeAll(async () => {
  if (!reachable) return
  ;({ user } = await seedUsers({ user: 'user@grnyte.rocks' }))
})

const fakeAuth = (error: null | { code: string; message: string } = null) => ({
  auth: { resetPasswordForEmail: vi.fn(async () => ({ error })) },
})

describe.skipIf(!reachable)('sendPasswordReset', () => {
  it('mails the reset link to the address on the verified token', async () => {
    const supabase = fakeAuth()

    expect(await asRequest(user.authId, () => sendPasswordReset(), supabase)).toEqual({ email: 'user@grnyte.rocks' })
    expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith('user@grnyte.rocks', expect.anything())
  })

  it('tells a signed-in caller about the rate limit instead of claiming a mail', async () => {
    const supabase = fakeAuth({ code: 'over_email_send_rate_limit', message: 'rate limited' })
    const outcome = await asRequest(user.authId, () => sendPasswordReset(), supabase).catch(
      (cause: { body?: unknown }) => cause.body,
    )

    expect(outcome).toEqual({ message: formError('auth_rateLimited') })
  })

  it('refuses a signed-out caller and mails nothing', async () => {
    const supabase = fakeAuth()

    expect(await statusOf(() => asAnonymousRequest(supabase, () => sendPasswordReset()))).toBe(401)
    expect(supabase.auth.resetPasswordForEmail).not.toHaveBeenCalled()
  })
})
