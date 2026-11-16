/**
 * Sign-in goes through the auth-only client and writes cookies only for an account that may sign in:
 * not a deleted one, not a contested one, and an unconfirmed one gets a code instead.
 */
import { CONTESTED_SIGNUP } from '$lib/auth'
import { cookieJar } from '$lib/auth/oauth/cookieJar.fixture'
import { asAnonymousRequest, callForm } from '$lib/remote/testHarness'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { signIn } from './signin.remote'

const calls = vi.hoisted(() => ({
  answer: {} as { error?: { code: string; message: string; status: number }; metadata?: Record<string, unknown> },
  cleared: [] as string[],
  ended: [] as string[],
  flagged: [] as string[],
  marked: new Set<string>(),
  resent: [] as string[],
  sessions: [] as unknown[],
}))

vi.mock('$lib/auth/authServer.server', () => ({
  supabaseAuthServer: () => ({
    resend: async ({ email }: { email: string }) => {
      calls.resent.push(email)
      return { error: null }
    },
    signInWithPassword: async () =>
      calls.answer.error != null
        ? { data: { session: null, user: null }, error: calls.answer.error }
        : {
            data: {
              session: { access_token: 'token-1', refresh_token: 'refresh-1' },
              user: { app_metadata: calls.answer.metadata ?? {}, id: 'auth-user-1' },
            },
            error: null,
          },
  }),
}))
vi.mock('$lib/db/supabaseAdmin.server', () => ({
  supabaseAdmin: () => ({
    auth: {
      admin: {
        signOut: async (token: string) => {
          calls.ended.push(token)
          return { error: null }
        },
        updateUserById: async (id: string) => {
          calls.flagged.push(id)
          return { error: null }
        },
      },
    },
  }),
}))
vi.mock('$lib/auth/codeAttempts.server', () => ({
  clearCodeTries: async (email: string) => {
    calls.cleared.push(email)
  },
}))
vi.mock('$lib/entities/user/provision.server', () => ({
  hasDeletionMarker: async (id: string) => calls.marked.has(id),
}))

const supabase = {
  auth: {
    setSession: async (session: unknown) => {
      calls.sessions.push(session)
      return { error: null }
    },
  },
}

type Outcome = { issues?: { message: string }[]; result?: Record<string, unknown> }
let jar = cookieJar()
const signInWith = async (fields: Record<string, string> = {}) => {
  const outcome = await asAnonymousRequest(
    supabase,
    () => callForm<Outcome>(signIn, { email: 'x@example.test', next: '/settings', password: 'pw', ...fields }),
    jar.cookies,
  )
  return { refusals: outcome.issues?.map((issue) => JSON.parse(issue.message).message), result: outcome.result }
}

beforeEach(() => {
  jar = cookieJar()
  calls.answer = {}
  for (const list of [calls.cleared, calls.ended, calls.flagged, calls.resent, calls.sessions]) list.length = 0
  calls.marked.clear()
})

describe('signIn', () => {
  it('lets an ordinary account through to where it was headed, with its session in the cookies', async () => {
    expect(await signInWith()).toEqual({ refusals: undefined, result: { redirectTo: '/settings' } })
    expect(calls.sessions).toEqual([{ access_token: 'token-1', refresh_token: 'refresh-1' }])
    expect(Object.fromEntries(jar.values)).toEqual({ 'grnyte-last-method': 'email' })
  })

  it('refuses a still-contested account and sends it to reset by mail, writing no cookie', async () => {
    calls.answer = { metadata: { [CONTESTED_SIGNUP]: 'owner' } }
    expect((await signInWith()).result).toEqual({ redirectTo: '/auth/forgot-password?contested=1' })
    expect(calls.ended).toEqual(['token-1'])
    expect(calls.sessions).toEqual([])
  })

  it('signs a deleted account straight back out and says it was deleted', async () => {
    calls.marked.add('auth-user-1')
    expect((await signInWith()).refusals).toEqual(['auth_accountDeleted'])
    expect(calls.ended).toEqual(['token-1'])
    expect(calls.sessions).toEqual([])
    expect(jar.written).toEqual([])
  })

  it('sends an unconfirmed account a code without flagging it, and opens the code step', async () => {
    calls.answer = { error: { code: 'email_not_confirmed', message: 'Email not confirmed', status: 400 } }
    expect((await signInWith({ codeFlow: '1' })).result).toEqual({
      confirm: 'x@example.test',
      resendToken: expect.any(String),
    })
    expect(calls.resent).toEqual(['x@example.test'])
    expect(calls.cleared).toEqual(['x@example.test'])
    expect(calls.flagged).toEqual([])
  })

  it('answers an older tab with the form-level message, still sending the code', async () => {
    calls.answer = { error: { code: 'email_not_confirmed', message: 'Email not confirmed', status: 400 } }
    expect((await signInWith()).refusals).toEqual(['auth_emailNotConfirmed'])
    expect(calls.resent).toEqual(['x@example.test'])
  })

  it('gives a wrong password the generic message and sends nothing', async () => {
    calls.answer = { error: { code: 'invalid_credentials', message: 'Invalid login credentials', status: 400 } }
    expect((await signInWith({ codeFlow: '1' })).refusals).toEqual(['auth_invalidCredentials'])
    expect(calls.resent).toEqual([])
    expect(jar.written).toEqual([])
  })
})
