/**
 * `spendProofOfWork` accepts a genuine solve exactly once and nothing else.
 */
import { reachable, sql } from '$lib/db/testDb'
import { solveChallenge, type Challenge } from 'altcha-lib'
import { deriveKey } from 'altcha-lib/algorithms/pbkdf2'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { issueChallenge, spendProofOfWork, sweepSpentChallenges } from './proofOfWork.server'

const nonces: string[] = []

const encode = (payload: unknown) => Buffer.from(JSON.stringify(payload)).toString('base64')

async function solved(): Promise<{ challenge: Challenge; encoded: string }> {
  const challenge = await issueChallenge()
  nonces.push(challenge.parameters.nonce)
  const solution = await solveChallenge({ challenge, deriveKey })
  return { challenge, encoded: encode({ challenge, solution }) }
}

afterEach(() => {
  vi.useRealTimers()
})

afterAll(async () => {
  if (reachable) await sql`delete from public.spent_challenges where nonce = any(${nonces})`
})

describe('issueChallenge', () => {
  it('issues a fresh challenge every time', async () => {
    const [a, b] = await Promise.all([issueChallenge(), issueChallenge()])
    expect(a.parameters.nonce).not.toBe(b.parameters.nonce)
  })
})

describe.skipIf(!reachable)('spendProofOfWork', () => {
  it('accepts a genuine solve once and refuses the replay', async () => {
    const { encoded } = await solved()
    expect(await spendProofOfWork(encoded)).toBe(true)
    expect(await spendProofOfWork(encoded)).toBe(false)
  })

  it('refuses two concurrent spends of one solve but one', async () => {
    const { encoded } = await solved()
    const results = await Promise.all([spendProofOfWork(encoded), spendProofOfWork(encoded)])
    expect(results.filter(Boolean)).toHaveLength(1)
  })

  it('refuses a missing or malformed payload', async () => {
    expect(await spendProofOfWork(undefined)).toBe(false)
    expect(await spendProofOfWork('')).toBe(false)
    expect(await spendProofOfWork('not base64 json')).toBe(false)
    expect(await spendProofOfWork(encode({ challenge: {}, solution: {} }))).toBe(false)
  })

  it('refuses a wrong answer', async () => {
    const { challenge } = await solved()
    const solution = { counter: 0, derivedKey: '00'.repeat(32) }
    expect(await spendProofOfWork(encode({ challenge, solution }))).toBe(false)
  })

  it('refuses a genuine solve whose expiry was pushed out after signing', async () => {
    const challenge = await issueChallenge()
    nonces.push(challenge.parameters.nonce)
    const solution = await solveChallenge({ challenge, deriveKey })
    const { expiresAt = 0 } = challenge.parameters
    const extended = { ...challenge, parameters: { ...challenge.parameters, expiresAt: expiresAt + 3600 } }
    expect(await spendProofOfWork(encode({ challenge: extended, solution }))).toBe(false)
  })

  it('refuses a solve submitted after the challenge expired', async () => {
    const { encoded } = await solved()
    vi.useFakeTimers({ now: Date.now() + 11 * 60 * 1000, toFake: ['Date'] })
    expect(await spendProofOfWork(encoded)).toBe(false)
  })
})

describe.skipIf(!reachable)('sweepSpentChallenges', () => {
  it('drops expired spends and keeps live ones', async () => {
    const [expired, live] = ['__sweep_expired__', '__sweep_live__']
    nonces.push(expired, live)
    await sql`insert into public.spent_challenges (nonce, expires_at) values
      (${expired}, now() - interval '1 minute'), (${live}, now() + interval '5 minutes')`

    await sweepSpentChallenges(new Date())

    const left = await sql<{ nonce: string }[]>`
      select nonce from public.spent_challenges where nonce in (${expired}, ${live})`
    expect(left.map((row) => row.nonce)).toEqual([live])
  })
})
