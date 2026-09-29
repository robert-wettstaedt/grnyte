/**
 * `signUp` answers a filled honeypot with the success a bot expects, without reaching GoTrue.
 */
import { asAnonymousRequest, callForm } from '$lib/remote/testHarness'
import { describe, expect, it } from 'vitest'
import { signUp } from './signup.remote'

describe('signUp', () => {
  it('creates nothing when the honeypot is filled', async () => {
    const calls: string[] = []
    const supabase = {
      auth: {
        signUp: async ({ email }: { email: string }) => {
          calls.push(email)
          return { data: { user: null }, error: { code: 'unexpected_failure' } }
        },
      },
    }

    const { result } = await asAnonymousRequest(supabase, () =>
      callForm<{ result: unknown }>(signUp, {
        confirmPassword: 'correct-horse',
        email: 'bot@example.test',
        password: 'correct-horse',
        username: 'botname',
        website: 'https://spam.example',
      }),
    )

    expect(result).toEqual({ success: true })
    expect(calls).toEqual([])
  })
})
