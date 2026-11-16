import { recordAuthEvent } from '$lib/auth/events.server'
import { sha256hex } from '$lib/auth/oauth/providers.server'
import { seal, unseal } from '$lib/auth/oauth/seal.server'
import type { OAuthTransaction, TransactionCarrier, VerifiedProof } from '$lib/auth/oauth/transaction.server'
import { pinnedTx } from '$lib/db/pinned.server'
import { appAuthFlows } from '$lib/db/serverOnly'
import { redirect } from '@sveltejs/kit'
import { and, eq, inArray, isNull, lt, sql } from 'drizzle-orm'
import { randomState } from 'openid-client'

export const HANDOFF_INFO = 'grnyte app handoff v1'
export const HANDOFF_CODE_LIFETIME_S = 60
/** Rows outlive `expires_at` by this, so a late return or a replay is still recognised. */
export const APP_AUTH_FLOW_GRACE_MS = 60 * 60 * 1000

/** `returnTo` never carries a query: it is one of `APP_RETURNS`. */
const back = (tx: OAuthTransaction, answer: Record<string, string>) => `${tx.returnTo}?${new URLSearchParams(answer)}`

/**
 * The native app's carrier, asked before the web's. A state it never held answers null with no side
 * effect; a state it already claimed is a replay and ends the request at the app's return.
 */
export const appCarrier: TransactionCarrier = {
  async land(_event, tx, result) {
    if (result.kind === 'cancelled') redirect(303, back(tx, { error: 'cancelled' }))
    // completeOAuth already recorded its own event for a failure.
    if (result.kind === 'failed') redirect(303, back(tx, { error: result.reason }))

    const code = randomState()
    // Apple's refresh token stays in memory: no app intent revokes.
    const proof: VerifiedProof = {
      claims: result.proof.claims,
      idToken: result.proof.idToken,
      rawNonce: result.proof.rawNonce,
    }
    const sealed = await seal(HANDOFF_INFO, proof)
    await pinnedTx((db) =>
      db
        .update(appAuthFlows)
        .set({
          codeHash: sha256hex(code),
          expiresAt: sql`now() + make_interval(secs => ${HANDOFF_CODE_LIFETIME_S})`,
          proof: sealed,
        })
        .where(eq(appAuthFlows.stateHash, sha256hex(tx.state))),
    )
    redirect(303, back(tx, { code }))
  },

  async take(_event, state) {
    if (state == null) return null
    const stateHash = sha256hex(state)
    // Expired rows are claimed too: completeOAuth's age check sends them back to the app as expired.
    const [claimed] = await pinnedTx((db) =>
      db
        .update(appAuthFlows)
        .set({ claimedAt: sql`now()` })
        .where(
          and(
            eq(appAuthFlows.stateHash, stateHash),
            isNull(appAuthFlows.claimedAt),
            inArray(appAuthFlows.purpose, ['link', 'signin']),
          ),
        )
        .returning({ transaction: appAuthFlows.transaction }),
    )
    if (claimed != null) return unsealed(claimed.transaction)

    const [seen] = await pinnedTx((db) =>
      db
        .select({ transaction: appAuthFlows.transaction })
        .from(appAuthFlows)
        .where(eq(appAuthFlows.stateHash, stateHash)),
    )
    if (seen == null) return null
    await recordAuthEvent('handoff_failed', { detail: { reason: 'state_replayed' } })
    redirect(303, back(await unsealed(seen.transaction), { error: 'expired' }))
  },
}

export async function sweepAppAuthFlows(before: Date): Promise<number> {
  const removed = await pinnedTx((db) => db.delete(appAuthFlows).where(lt(appAuthFlows.expiresAt, before)))
  return removed.count
}

/** A row of this table that does not unseal (the key rotated) is still the app's: never the web carrier's. */
async function unsealed(sealed: null | string): Promise<OAuthTransaction> {
  const tx = sealed == null ? null : await unseal<OAuthTransaction>(HANDOFF_INFO, sealed)
  if (tx == null) redirect(303, '/auth/error?reason=expired')
  return tx
}
