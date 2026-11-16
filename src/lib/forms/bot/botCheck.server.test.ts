/**
 * `screenSubmit` passes people, tells the handler about bots without spending anything, and refuses
 * a submit whose proof of work is missing or already spent.
 */
import { reachable, sql } from '$lib/db/testDb'
import { afterAll, describe, expect, it } from 'vitest'
import { screenSubmit } from './botCheck.server'
import { solvedProofOfWork } from './proofOfWorkFixture'

const nonces: string[] = []

async function solve(): Promise<string> {
  const { encoded, nonce } = await solvedProofOfWork()
  nonces.push(nonce)
  return encoded
}

afterAll(async () => {
  if (reachable) await sql`delete from public.spent_challenges where nonce = any(${nonces})`
})

describe.skipIf(!reachable)('screenSubmit', () => {
  it('passes a filled-in form carrying a fresh solve', async () => {
    expect(await screenSubmit({ altcha: await solve() })).toBe('person')
  })

  it('names a filled honeypot a bot and leaves its solve unspent', async () => {
    const altcha = await solve()
    expect(await screenSubmit({ altcha, hpcheck: 'https://spam.example' })).toBe('bot')
    expect(await screenSubmit({ altcha })).toBe('person')
  })

  it('refuses a submit without a solve', async () => {
    await expect(screenSubmit({})).rejects.toBeDefined()
  })

  it('refuses a solve it has already spent', async () => {
    const altcha = await solve()
    await screenSubmit({ altcha })
    await expect(screenSubmit({ altcha })).rejects.toBeDefined()
  })
})
