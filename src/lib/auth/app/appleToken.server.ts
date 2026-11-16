import { recordAuthEvent } from '$lib/auth/events.server'
import { appleClientSecret, providerHttp } from '$lib/auth/oauth/providers.server'
import { JwksUnavailable, taggingJwks } from '$lib/auth/verify.server'
import { formError } from '$lib/forms/schemas'
import { error } from '@sveltejs/kit'
import { createRemoteJWKSet, decodeJwt, jwtVerify, type JWTVerifyGetKey } from 'jose'
import type { IDToken } from 'openid-client'

const APPLE_ISSUER = 'https://appleid.apple.com'

/** Apple's signing keys, one set per process with jose's cooldown and cache; tests swap `source`. */
export const appleKeys: { source: JWTVerifyGetKey } = {
  source: createRemoteJWKSet(new URL(`${APPLE_ISSUER}/auth/keys`)),
}

export type AppleVerdict = { claims: IDToken; ok: true } | { ok: false; reason: 'invalid' | 'unavailable' }

/** A native authorization code at Apple's token endpoint (no `redirect_uri`: it was issued without one); null on any failure. */
export async function exchangeAppleCode(
  code: string,
  clientId: string,
): Promise<null | { refreshToken: string; sub: string }> {
  try {
    const response = await providerHttp.fetch(`${APPLE_ISSUER}/auth/token`, {
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: await appleClientSecret(clientId),
        code,
        grant_type: 'authorization_code',
      }),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      method: 'POST',
      redirect: 'manual',
      signal: AbortSignal.timeout(5000),
    })
    if (response.status !== 200) return null
    const answer = (await response.json()) as { id_token?: string; refresh_token?: string }
    // Read from Apple's own TLS answer, as change 2 trusts its code grant.
    const sub = answer.id_token == null ? undefined : decodeJwt(answer.id_token).sub
    return answer.refresh_token == null || sub == null ? null : { refreshToken: answer.refresh_token, sub }
  } catch (cause) {
    console.warn('[oauth] apple code exchange failed:', cause)
    return null
  }
}

/** The verified claims, or the one fixed refusal (the same whatever account the address has); 503 for Apple's keys out. */
export async function requireAppleToken(token: string, audience: string, nonceDigest: string): Promise<IDToken> {
  const verdict = await verifyAppleIdToken(token, audience, nonceDigest)
  if (verdict.ok) return verdict.claims
  if (verdict.reason === 'unavailable') error(503, { message: 'auth_serviceUnavailable' })
  await recordAuthEvent('handoff_failed', { detail: { reason: 'apple_token_invalid' } })
  error(400, { message: formError('auth_oauthFailedBody') })
}

/** A device's Apple ID token, verified before any claim is read (design decision 5). */
export async function verifyAppleIdToken(token: string, audience: string, nonceDigest: string): Promise<AppleVerdict> {
  try {
    const { payload } = await jwtVerify(token, taggingJwks(appleKeys.source), {
      algorithms: ['RS256'],
      audience,
      issuer: APPLE_ISSUER,
      requiredClaims: ['sub', 'iat', 'exp', 'nonce'],
    })
    // Both are public digests; timingSafeEqual would throw on another length.
    if (payload.nonce !== nonceDigest) return { ok: false, reason: 'invalid' }
    return { claims: payload as IDToken, ok: true }
  } catch (thrown) {
    return { ok: false, reason: thrown instanceof JwksUnavailable ? 'unavailable' : 'invalid' }
  }
}
