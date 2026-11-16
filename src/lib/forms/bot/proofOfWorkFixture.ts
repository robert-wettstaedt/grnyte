import { solveChallenge } from 'altcha-lib'
import { deriveKey } from 'altcha-lib/algorithms/pbkdf2'
import { issueChallenge } from './proofOfWork.server'

/** A genuine, unspent solve, encoded the way the widget posts it. Returns the nonce for cleanup. */
export async function solvedProofOfWork(): Promise<{ encoded: string; nonce: string }> {
  const challenge = await issueChallenge()
  const solution = await solveChallenge({ challenge, deriveKey })
  const encoded = Buffer.from(JSON.stringify({ challenge, solution })).toString('base64')
  return { encoded, nonce: challenge.parameters.nonce }
}
