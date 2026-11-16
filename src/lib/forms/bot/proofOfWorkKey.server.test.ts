/** Challenge keys derive from the secret key: a challenge from before a key switch fails once. */
import { withSecretKey } from '$lib/db/secretKey.fixture'
import { reachable, sql } from '$lib/db/testDb'
import { solveChallenge } from 'altcha-lib'
import { deriveKey } from 'altcha-lib/algorithms/pbkdf2'
import { afterAll, describe, expect, it } from 'vitest'

const nonces: string[] = []

async function solvedUnder(key: string): Promise<string> {
  const { issueChallenge } = await withKey(key)
  const challenge = await issueChallenge()
  nonces.push(challenge.parameters.nonce)
  const solution = await solveChallenge({ challenge, deriveKey })
  return Buffer.from(JSON.stringify({ challenge, solution })).toString('base64')
}

const withKey = (key: string) => withSecretKey(key, () => import('./proofOfWork.server'))

afterAll(async () => {
  if (reachable) await sql`delete from public.spent_challenges where nonce = any(${nonces})`
})

describe('proof-of-work keys', () => {
  it('refuses a challenge issued under another secret key', async () => {
    const encoded = await solvedUnder('sb_secret_before_the_switch')
    const { spendProofOfWork } = await withKey('sb_secret_after_the_switch')

    expect(await spendProofOfWork(encoded)).toBe(false)
  })

  it.skipIf(!reachable)('accepts the same solve under the key it was issued with', async () => {
    const encoded = await solvedUnder('sb_secret_before_the_switch')
    const { spendProofOfWork } = await withKey('sb_secret_before_the_switch')

    expect(await spendProofOfWork(encoded)).toBe(true)
  })
})
