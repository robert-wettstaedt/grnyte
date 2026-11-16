// @vitest-environment node
import { getRequestEvent } from '$app/server'
import { createThrowawayUser, dropThrowawayUser, reachable, seedUsers, sql, type SeedUser } from '$lib/db/testDb'
import { formError } from '$lib/forms/schemas'
import { asAnonymousRequest, asRequest, statusOf } from '$lib/remote/testHarness'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { sendPasswordReset, signedInDevices, signOutDevice, signOutOthers } from './session.remote'

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
  // The session client a test passes in stands for the caller's GoTrue client (`callerAuthServer`).
  supabaseAuthServerAs: () => getRequestEvent().locals.supabase.auth,
}))
beforeEach(() => {
  reset.error = null
  reset.sent = []
})
const supabase = { auth: {} }

describe.skipIf(!reachable)('signed-in devices', () => {
  let me: SeedUser
  let other: SeedUser
  beforeAll(async () => {
    me = await createThrowawayUser('devices-me')
    other = await createThrowawayUser('devices-other')
  })
  afterAll(async () => {
    await dropThrowawayUser(me)
    await dropThrowawayUser(other)
  })

  /** A session GoTrue would record with the browser's address and user agent. */
  const browserSession = async (user: SeedUser) =>
    (
      await sql<{ id: string }[]>`
        insert into auth.sessions (user_id, ip, user_agent, refreshed_at)
        values (${user.authId}, '203.0.113.7', 'Mozilla/5.0 Probe', now() at time zone 'UTC') returning id`
    )[0].id
  const exists = async (id: string) => (await sql`select 1 from auth.sessions where id = ${id}`).length === 1
  const own = () => getRequestEvent().locals.claims?.session_id ?? ''

  it('lists only the caller’s sessions, the calling one marked, with no address or browser', async () => {
    const phone = await browserSession(me)
    await browserSession(other)

    const { current, devices } = await asRequest(me.authId, async () => ({
      current: own(),
      devices: await signedInDevices(),
    }))

    expect(devices.map((device) => device.id).sort()).toEqual([current, phone].sort())
    expect(devices.find((device) => device.id === current)?.current).toBe(true)
    for (const device of devices)
      expect(Object.keys(device).sort()).toEqual(['activeAt', 'current', 'id', 'signedInAt'])
  })

  it('signs out another of the caller’s devices', async () => {
    const phone = await browserSession(me)
    await asRequest(me.authId, () => signOutDevice({ id: phone }))
    expect(await exists(phone)).toBe(false)
  })

  it('signs out nothing for another account’s session, and refuses the calling one', async () => {
    const theirs = await browserSession(other)
    await asRequest(me.authId, () => signOutDevice({ id: theirs }))
    expect(await exists(theirs)).toBe(true)

    const status = await statusOf(() => asRequest(me.authId, () => signOutDevice({ id: own() })))
    expect(status).toBe(400)
  })

  it('refuses both to a revoked session', async () => {
    const signOut = vi.fn(async () => ({ error: null }))
    const revoked = (run: () => Promise<unknown>) =>
      asRequest(
        me.authId,
        async () => {
          await sql`delete from auth.sessions where id = ${own()}`
          return run()
        },
        { auth: { signOut } },
      ).catch((cause: { body?: unknown }) => cause.body)

    expect(await revoked(() => signedInDevices())).toEqual({ message: formError('auth_sessionEnded') })
    expect(await revoked(() => signOutDevice({ id: crypto.randomUUID() }))).toEqual({
      message: formError('auth_sessionEnded'),
    })
  })
})

describe.skipIf(!reachable)('signOutOthers', () => {
  it('asks GoTrue to end the other sessions only, never this one', async () => {
    const signOut = vi.fn(async () => ({ error: null }))
    await asRequest(user.authId, () => signOutOthers(), { auth: { signOut } })
    expect(signOut).toHaveBeenCalledExactlyOnceWith({ scope: 'others' })
  })
})

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
