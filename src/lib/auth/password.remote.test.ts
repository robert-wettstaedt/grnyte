/** `setNewPassword` on a code session: the policy before the write, every code and grant void after it. */
import { getRequestEvent } from '$app/server'
import { hasGrant, sessionCaller, writeGrant } from '$lib/auth/reauth.server'
import { createThrowawayUser, dropThrowawayUser, makeProviderOnly, reachable, sql, type SeedUser } from '$lib/db/testDb'
import { formError } from '$lib/forms/schemas'
import { asRequest } from '$lib/remote/testHarness'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { setNewPassword } from './password.remote'

const policy = vi.hoisted(() => ({ breached: false }))
vi.mock('$lib/auth/passwordPolicy.server', () => ({ checkPassword: async () => (policy.breached ? 'breached' : 'ok') }))
// The harness token carries no `amr`; the code-session rule has its own GoTrue tests.
vi.mock('$lib/auth', async (original) => ({ ...(await original<object>()), isFreshCodeSession: () => true }))

// The body acts through the caller's server client; here it answers the request's stub.
vi.mock('$lib/auth/authServer.server', () => ({ supabaseAuthServerAs: () => getRequestEvent().locals.supabase.auth }))

let user: SeedUser

// Its own account: `voidReauth` empties every code of the account, which other suites' seed users hold.
beforeAll(async () => {
  if (reachable) user = await createThrowawayUser('setpassword')
})

afterAll(async () => {
  if (reachable) await dropThrowawayUser(user)
})

beforeEach(async () => {
  policy.breached = false
  if (!reachable) return
  await sql`delete from public.reauth_challenges where auth_user_fk = ${user.authId}`
  await sql`delete from public.auth_code_attempts where subject = ${user.authId}`
})

const NEW = 'a-new-Passw0rd!'

/** Runs it in one request after a grant and an open code were written, and reads both back. */
const run = () => {
  const updateUser = vi.fn(async () => ({ error: null }))
  const signOut = vi.fn(async () => ({ error: null }))
  const request = async () => {
    const caller = sessionCaller()
    await writeGrant(caller, 'account.delete', user.authId, 'email_code')
    await sql`
      insert into public.reauth_challenges (action, auth_user_fk, code_hash, expires_at, session_id, target)
      values ('region.delete', ${user.authId}, 'x', now() + interval '10 minutes', ${caller.sessionId}, '1')`
    const outcome = await setNewPassword({ password: NEW }).then(
      (answer) => answer as unknown,
      (cause: { body?: unknown }) => cause.body,
    )
    return {
      grant: await hasGrant(caller, 'account.delete', user.authId),
      openCodes: (await sql`select 1 from public.reauth_challenges where auth_user_fk = ${user.authId}`).length,
      outcome,
    }
  }
  return asRequest(user.authId, request, { auth: { signOut, updateUser } }).then((done) => ({ ...done, updateUser }))
}

describe.skipIf(!reachable)('setNewPassword', () => {
  it('refuses a breached password on its field and stores nothing', async () => {
    policy.breached = true
    const { grant, outcome, updateUser } = await run()

    expect(outcome).toEqual({ field: 'password', message: formError('auth_passwordBreached') })
    expect(updateUser).not.toHaveBeenCalled()
    expect(grant).toBe(true)
  })

  it('voids every open code and grant once the password is written', async () => {
    const { grant, openCodes, outcome, updateUser } = await run()

    expect(outcome).toEqual({ done: true })
    expect(updateUser).toHaveBeenCalledWith({ password: NEW })
    expect([grant, openCodes]).toEqual([false, 0])
  })

  it('gives an account that has only a provider its email identity, once', async () => {
    await makeProviderOnly(user, 'apple')

    await run()
    await run()
    const providers = await sql<{ provider: string }[]>`
      select provider from auth.identities where user_id = ${user.authId} order by provider`
    expect(providers.map((row) => row.provider)).toEqual(['apple', 'email'])
  })
})
