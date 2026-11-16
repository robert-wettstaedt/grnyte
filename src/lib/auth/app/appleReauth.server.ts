import { getRequestEvent } from '$app/server'
import type { ReauthAction } from '$lib/auth'
import { recordAuthEvent } from '$lib/auth/events.server'
import { signInMethods } from '$lib/auth/methods.server'
import { acceptAppleConfirmation } from '$lib/auth/oauth/linking.server'
import { configuredProviders, providerNonce, revokeAppleToken } from '$lib/auth/oauth/providers.server'
import { boundTarget, reauthCaller } from '$lib/auth/reauth.server'
import { pinnedTx } from '$lib/db/pinned.server'
import { appAuthFlows } from '$lib/db/serverOnly'
import { error } from '@sveltejs/kit'
import { sql } from 'drizzle-orm'
import { randomNonce } from 'openid-client'
import { exchangeAppleCode, requireAppleToken } from './appleToken.server'
import { APP_BUNDLE_ID } from './constants'
import { requireStartSlot, startClientHash } from './handoff.server'
import { refuseOAuthFailed } from './refusal.server'

/** The nonce's lifetime: a token carrying it was issued within it, so no separate `iat` rule. */
const REAUTH_FLOW_LIFETIME_S = 5 * 60
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** `POST reauth/apple/confirm`: spend the flow, verify the token, then the grant, then revoke if due. */
export async function confirmAppleReauth(input: {
  authorizationCode?: string
  flowId: string
  idToken: string
}): Promise<{ confirmed: true }> {
  const token = getRequestEvent().locals.verifiedToken
  const caller = await reauthCaller()
  if (token == null) error(401)
  const [row] = UUID.test(input.flowId)
    ? await pinnedTx((db) =>
        db.execute<{ action: ReauthAction; nonce_digest: string; target: string }>(sql`
          delete from app_auth_flows
          where id = ${input.flowId} and purpose = 'reauth' and auth_user_fk = ${caller.authUserId}
            and session_id = ${caller.sessionId} and expires_at > now()
          returning action, target, nonce_digest`),
      )
    : []
  if (row == null) {
    await recordAuthEvent('handoff_failed', {
      authUserId: caller.authUserId,
      detail: { reason: 'apple_reauth_mismatch' },
    })
    refuseOAuthFailed()
  }

  const claims = await requireAppleToken(input.idToken, APP_BUNDLE_ID, row.nonce_digest)
  const answer = await acceptAppleConfirmation(token, caller, row.action, row.target, claims, () =>
    revokeNative(caller.authUserId, claims.sub, input.authorizationCode),
  )
  if (answer !== 'granted') refuseOAuthFailed()
  return { confirmed: true }
}

/** `POST reauth/apple/start`: a nonce digest bound to this caller, action and target. */
export async function startAppleReauth(input: {
  action: ReauthAction
  target: string
}): Promise<{ flowId: string; nonce: string }> {
  if (!configuredProviders(getRequestEvent()).includes('apple')) refuseOAuthFailed()
  const caller = await reauthCaller()
  const target = boundTarget(caller, input.action, input.target)
  if (!(await signInMethods(caller.authUserId)).providers.includes('apple')) refuseOAuthFailed()
  const clientHash = startClientHash()
  await requireStartSlot(clientHash)

  const nonce = providerNonce(randomNonce())
  const [row] = await pinnedTx((db) =>
    db
      .insert(appAuthFlows)
      .values({
        action: input.action,
        authUserFk: caller.authUserId,
        clientHash,
        expiresAt: sql`now() + make_interval(secs => ${REAUTH_FLOW_LIFETIME_S})`,
        nonceDigest: nonce,
        provider: 'apple',
        purpose: 'reauth',
        sessionId: caller.sessionId,
        target,
      })
      .returning({ id: appAuthFlows.id }),
  )
  return { flowId: row.id, nonce }
}

/** Revokes through the app's own code, only when Apple's answer to it names the verified Apple ID. */
async function revokeNative(authUserId: string, sub: string, code: string | undefined): Promise<boolean> {
  if (code == null) return false
  const exchanged = await exchangeAppleCode(code, APP_BUNDLE_ID)
  if (exchanged == null || exchanged.sub !== sub) {
    await recordAuthEvent('handoff_failed', { authUserId, detail: { reason: 'apple_code_mismatch' } })
    return false
  }
  return revokeAppleToken(exchanged.refreshToken, APP_BUNDLE_ID)
}
