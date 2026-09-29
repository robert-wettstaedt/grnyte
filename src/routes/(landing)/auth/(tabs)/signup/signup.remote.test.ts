/**
 * `signUp` never reaches GoTrue for a filled honeypot or a missing proof of work.
 */
import { asAnonymousRequest, callForm } from '$lib/remote/testHarness'
import { beforeEach, describe, expect, it } from 'vitest'
import { signUp } from './signup.remote'

const FIELDS = {
  confirmPassword: 'correct-horse',
  email: 'bot@example.test',
  password: 'correct-horse',
  username: 'botname',
}

let calls: string[] = []
const supabase = {
  auth: {
    signUp: async ({ email }: { email: string }) => {
      calls.push(email)
      return { data: { user: null }, error: { code: 'unexpected_failure' } }
    },
  },
}

interface Outcome {
  issues?: { message: string }[]
  result?: unknown
}

const submit = (data: Record<string, unknown>) => asAnonymousRequest(supabase, () => callForm<Outcome>(signUp, data))

/** The message keys a refusal carries. */
const refusals = ({ issues = [] }: Outcome) => issues.map((issue) => JSON.parse(issue.message).message)

beforeEach(() => {
  calls = []
})

describe('signUp', () => {
  it('creates nothing when the honeypot is filled', async () => {
    const { result } = await submit({ ...FIELDS, website: 'https://spam.example' })
    expect(result).toEqual({ success: true })
    expect(calls).toEqual([])
  })

  it('refuses a sign-up without a solved proof of work before reaching GoTrue', async () => {
    expect(refusals(await submit(FIELDS))).toEqual(['auth_verificationFailed'])
    expect(calls).toEqual([])
  })
})
