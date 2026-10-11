/**
 * A confirmed account that still carries the contested flag is refused at sign-in: `/auth/confirm`
 * could not replace its password, so the one typed here may be a stranger's.
 */
import { CONTESTED_SIGNUP } from '$lib/auth'
import { asAnonymousRequest, callForm } from '$lib/remote/testHarness'
import { describe, expect, it } from 'vitest'
import { signIn } from './signin.remote'

const signInAs = async (appMetadata: Record<string, unknown>) => {
  const signedOut: unknown[] = []
  const supabase = {
    auth: {
      signInWithPassword: async () => ({ data: { user: { app_metadata: appMetadata } }, error: null }),
      signOut: async (options: unknown) => {
        signedOut.push(options)
        return { error: null }
      },
    },
  }
  const outcome = await asAnonymousRequest(supabase, () =>
    callForm<{ result?: { redirectTo: string } }>(signIn, {
      email: 'x@example.test',
      next: '/settings',
      password: 'pw',
    }),
  )
  return { redirectTo: outcome.result?.redirectTo, signedOut }
}

describe('signIn', () => {
  it('lets an ordinary account through to where it was headed', async () => {
    expect(await signInAs({})).toEqual({ redirectTo: '/settings', signedOut: [] })
  })

  it('refuses a still-contested account and sends it to reset by mail', async () => {
    expect(await signInAs({ [CONTESTED_SIGNUP]: 'owner' })).toEqual({
      redirectTo: '/auth/forgot-password?contested=1',
      signedOut: [{ scope: 'local' }],
    })
  })
})
