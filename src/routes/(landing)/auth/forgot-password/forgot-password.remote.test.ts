/**
 * `forgotPassword` sends a reset only to a confirmed account and answers every caller alike.
 */
import { reachable, sql } from '$lib/db/testDb'
import { asAnonymousRequest, callForm } from '$lib/remote/testHarness'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { forgotPassword } from './forgot-password.remote'

const CONFIRMED = '__forgot_confirmed__@example.test'
const UNCONFIRMED = '__forgot_unconfirmed__@example.test'
const UNKNOWN = '__forgot_unknown__@example.test'

let sent: string[] = []
const supabase = {
  auth: {
    resetPasswordForEmail: async (email: string) => {
      sent.push(email)
      return { error: null }
    },
  },
}

const submit = async (data: Record<string, unknown>) => {
  const { result } = await asAnonymousRequest(supabase, () =>
    callForm<{ result: { email: string; success: boolean } }>(forgotPassword, data),
  )
  return result
}

const cleanup = () => sql`delete from auth.users where email in (${CONFIRMED}, ${UNCONFIRMED})`

beforeAll(async () => {
  if (!reachable) return
  await cleanup()
  await sql`insert into auth.users (id, email, email_confirmed_at) values (gen_random_uuid(), ${CONFIRMED}, now())`
  await sql`insert into auth.users (id, email) values (gen_random_uuid(), ${UNCONFIRMED})`
})

beforeEach(() => {
  sent = []
})

afterAll(async () => {
  if (reachable) await cleanup()
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

  it('sends nothing to an unconfirmed account and answers the same', async () => {
    expect(await submit({ email: UNCONFIRMED })).toEqual({ email: UNCONFIRMED, success: true })
    expect(sent).toEqual([])
  })

  it('sends nothing to an unknown address and answers the same', async () => {
    expect(await submit({ email: UNKNOWN })).toEqual({ email: UNKNOWN, success: true })
    expect(sent).toEqual([])
  })

  it('sends nothing when the honeypot is filled, even for a confirmed account', async () => {
    expect(await submit({ email: CONFIRMED, website: 'https://spam.example' })).toEqual({
      email: CONFIRMED,
      success: true,
    })
    expect(sent).toEqual([])
  })
})
