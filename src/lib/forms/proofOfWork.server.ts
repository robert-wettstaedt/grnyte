import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private'
import { pinnedTx } from '$lib/db/pinned.server'
import { spentChallenges } from '$lib/db/schema'
import { createChallenge, verifySolution, type Challenge, type Payload } from 'altcha-lib'
import { deriveKey } from 'altcha-lib/algorithms/pbkdf2'
import { lt } from 'drizzle-orm'
import { createHmac, randomInt } from 'node:crypto'

const ALGORITHM = 'PBKDF2/SHA-256'
const CHALLENGE_TTL_MS = 10 * 60 * 1000
/** Browser solve is ~90ms per 1000 attempts on 12 laptop workers, so about 1s on a mid-range phone. */
const COST = 1_000
const COUNTER_MIN = 1_500
const COUNTER_MAX = 3_000

/** Derived, not a secret of its own: domain-separated from its parent and as secret as it. */
const derive = (label: string) => createHmac('sha256', SUPABASE_SERVICE_ROLE_KEY).update(label).digest('hex')
const secrets = {
  hmacKeySignatureSecret: derive('altcha-key-signature'),
  hmacSignatureSecret: derive('altcha-challenge-signature'),
}

export function issueChallenge(): Promise<Challenge> {
  return createChallenge({
    algorithm: ALGORITHM,
    cost: COST,
    counter: randomInt(COUNTER_MIN, COUNTER_MAX + 1),
    deriveKey,
    expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
    ...secrets,
  })
}

/**
 * True when `encoded` solves a challenge this server issued, unexpired, and never accepted before.
 * The spend is one insert, so two concurrent replays cannot both pass.
 */
export async function spendProofOfWork(encoded: string | undefined): Promise<boolean> {
  const payload = parsePayload(encoded)
  if (payload == null) return false

  // A malformed hex field throws inside the library rather than failing verification.
  const verified = await verifySolution({ ...payload, deriveKey, ...secrets }).then(
    (result) => result.verified,
    () => false,
  )
  const { expiresAt, nonce } = payload.challenge.parameters
  if (!verified || expiresAt == null) return false

  const spent = await pinnedTx((tx) =>
    tx
      .insert(spentChallenges)
      .values({ expiresAt: new Date(expiresAt * 1000), nonce })
      .onConflictDoNothing()
      .returning({ nonce: spentChallenges.nonce }),
  )
  return spent.length === 1
}

/** Drop spends past their challenge's expiry: an expired challenge is refused before the table is read. */
export async function sweepSpentChallenges(now: Date): Promise<number> {
  const removed = await pinnedTx((tx) =>
    tx.delete(spentChallenges).where(lt(spentChallenges.expiresAt, now)).returning({ nonce: spentChallenges.nonce }),
  )
  return removed.length
}

function parsePayload(encoded: string | undefined): null | Payload {
  if (encoded == null || encoded === '') return null
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')) as Payload
    return payload?.challenge?.parameters != null && payload.solution != null ? payload : null
  } catch {
    return null
  }
}
