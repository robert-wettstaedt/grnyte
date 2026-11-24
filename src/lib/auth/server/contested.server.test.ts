import { CONTESTED_SIGNUP } from '$lib/auth'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { revokeContestedPassword } from './contested.server'

const USER = { email: 'contested@example.test', id: 'auth-user-1' }
const MINTED = { access_token: 'minted.access', refresh_token: 'minted-refresh' }

/** What the helper did: admin changes, codes minted, codes verified, sessions held and ended. */
const adminCalls: { app_metadata?: Record<string, unknown>; id: string; password?: string }[] = []
const minted: { email: string; type: string }[] = []
const verifiedCodes: { email: string; token: string; type: string }[] = []
const held: unknown[] = []
const ended: string[] = []
const fails = { admin: false, hold: false, link: false, verify: false }

vi.mock('$app/server', () => ({ getRequestEvent: () => ({ getClientAddress: () => '203.0.113.9' }) }))
vi.mock('$lib/logging/failure.server', () => ({ logServerFailure: vi.fn() }))
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
vi.mock('./authServer.server', () => ({
  supabaseAuthServer: () => ({
    verifyOtp: async (params: { email: string; token: string; type: string }) => {
      verifiedCodes.push(params)
      return fails.verify
        ? { data: { session: null }, error: { code: 'otp_expired', message: 'expired' } }
        : { data: { session: MINTED }, error: null }
    },
  }),
}))

const supabase = {
  auth: {
    setSession: async (session: unknown) => {
      held.push(session)
      return { error: fails.hold ? { code: 'session_not_found', message: 'gone' } : null }
    },
  },
} as unknown as App.Locals['supabase']

beforeEach(() => {
  for (const list of [adminCalls, minted, verifiedCodes, held, ended]) list.length = 0
  Object.assign(fails, { admin: false, hold: false, link: false, verify: false })
})

describe('revokeContestedPassword', () => {
  it('replaces the password by one admin change, then holds a fresh code session for the owner', async () => {
    expect(await revokeContestedPassword(supabase, USER)).toBe(true)
    // One admin change: no password notice is mailed, and the flag goes with it.
    expect(adminCalls).toEqual([
      { app_metadata: { [CONTESTED_SIGNUP]: null }, id: USER.id, password: expect.stringMatching(/^.{40,}$/) },
    ])
    expect(minted).toEqual([{ email: USER.email, type: 'magiclink' }])
    expect(verifiedCodes).toEqual([{ email: USER.email, token: '24681357', type: 'email' }])
    expect(held).toEqual([MINTED])
  })

  it('mints no code when the admin change fails', async () => {
    fails.admin = true
    expect(await revokeContestedPassword(supabase, USER)).toBe(false)
    expect(minted).toEqual([])
    expect(held).toEqual([])
  })

  it.each(['link', 'verify', 'hold'] as const)('fails when the code session fails at %s', async (step) => {
    fails[step] = true
    expect(await revokeContestedPassword(supabase, USER)).toBe(false)
    expect(adminCalls).toHaveLength(1)
    // A minted session nobody could hold is ended, not left live.
    expect(ended).toEqual(step === 'hold' ? [MINTED.access_token] : [])
  })
})
