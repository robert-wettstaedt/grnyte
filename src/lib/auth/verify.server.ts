import { env } from '$env/dynamic/private'
import { isContested, type VerifiedClaims } from '$lib/auth'
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose'

/**
 * `expired` is the one rejection a caller may act on: the cookie's `expires_at` and the token's `exp`
 * can disagree, and a refreshable session must not be treated as a forgery.
 */
export type VerifyResult =
  { claims: VerifiedClaims; ok: true } | { ok: false; reason: 'absent' | 'expired' | 'invalid' | 'unavailable' }

/** The key set could not be fetched: an outage, which callers must not treat as a forged token. */
class JwksUnavailable extends Error {}

// jose's codes for a set that answered but holds no key for this token: a bad token, not an outage.
const NO_KEY_FOR_TOKEN = new Set(['ERR_JWKS_MULTIPLE_MATCHING_KEYS', 'ERR_JWKS_NO_MATCHING_KEY'])

export interface VerifierConfig {
  /** The issuer every token must carry; unset where GoTrue issues none (the local stacks). */
  issuer?: string
  /** The project's published signing keys (ES256 / RS256). */
  jwks?: JWTVerifyGetKey
  /** The legacy HS256 secret, while tokens signed with it can still be in circulation. */
  secret?: Uint8Array
}

/**
 * A verifier for exactly the keys configured. An HS256 header only ever reaches the secret and any
 * other header only the JWKS, so an attacker-chosen `alg` cannot pick a key of the wrong type.
 */
export function createAccessTokenVerifier({ issuer, jwks, secret }: VerifierConfig) {
  // Built from what is configured, so removing the secret stops HS256 being accepted at all.
  const algorithms = [...(secret == null ? [] : ['HS256']), ...(jwks == null ? [] : ['ES256', 'RS256'])]

  if (algorithms.length === 0) {
    console.error(
      '[auth] FATAL CONFIG: neither SUPABASE_JWT_SECRET nor SUPABASE_JWT_JWKS_URL is usable. ' +
        'Every request will be treated as anonymous.',
    )
  }

  const resolveKey: JWTVerifyGetKey = async (header, token) => {
    if (header.alg === 'HS256') {
      if (secret == null) {
        throw new Error('[auth] HS256 token but no symmetric key is configured')
      }
      return secret
    }

    if (jwks == null) {
      throw new Error('[auth] asymmetric token but no JWKS is configured')
    }

    try {
      return await jwks(header, token)
    } catch (thrown) {
      // Classified by place: whatever the key getter throws is an outage unless the set answered without this key.
      if (NO_KEY_FOR_TOKEN.has((thrown as { code?: string }).code ?? '')) {
        throw thrown
      }
      throw new JwksUnavailable('[auth] the JWKS could not be fetched', { cause: thrown })
    }
  }

  /**
   * The one place a `sub` becomes trustworthy: RLS reads only the verified claims this returns.
   * `audience` and the required `sub` keep API keys out; the legacy ones are HS256 JWTs until disabled.
   */
  return async function verify(accessToken: null | string | undefined): Promise<VerifyResult> {
    if (accessToken == null || accessToken.length === 0) {
      return { ok: false, reason: 'absent' }
    }

    if (algorithms.length === 0) {
      return { ok: false, reason: 'invalid' }
    }

    try {
      const { payload } = await jwtVerify(accessToken, resolveKey, {
        algorithms,
        audience: 'authenticated',
        clockTolerance: 5,
        requiredClaims: ['exp', 'sub'],
        ...(issuer == null ? {} : { issuer }),
      })

      // The only cast that produces the brand, in the only module allowed to.
      return isSession(payload)
        ? { claims: payload as unknown as VerifiedClaims, ok: true }
        : { ok: false, reason: 'invalid' }
    } catch (thrown) {
      return rejection(thrown)
    }
  }
}

/** `requiredClaims` asserts presence only. GoTrue's password grant is public, so a contested account is refused too. */
function isSession(payload: JWTPayload): boolean {
  const hasSubject = typeof payload.sub === 'string' && payload.sub.length > 0
  return hasSubject && payload.role === 'authenticated' && !isContested(payload.app_metadata)
}

function rejection(thrown: unknown): VerifyResult {
  if (thrown instanceof JwksUnavailable) {
    return { ok: false, reason: 'unavailable' }
  }

  const code = (thrown as { code?: string }).code
  if (code === 'ERR_JWT_EXPIRED') {
    return { ok: false, reason: 'expired' }
  }

  warnOnProbableKeyMismatch(code)
  return { ok: false, reason: 'invalid' }
}

// Below 32 bytes (GoTrue's own minimum) the secret counts as absent, which fails closed.
const configuredSecret = env.SUPABASE_JWT_SECRET ?? ''
const jwksUrl = env.SUPABASE_JWT_JWKS_URL ?? ''

export const verifyAccessToken = createAccessTokenVerifier({
  issuer: env.SUPABASE_JWT_ISSUER || undefined,
  jwks: jwksUrl.length === 0 ? undefined : createRemoteJWKSet(new URL(jwksUrl)),
  secret: configuredSecret.length >= 32 ? new TextEncoder().encode(configuredSecret) : undefined,
})

/** Once per process: key drift otherwise fails every request silently and loops the user through sign-in. */
let keyMismatchWarned = false
function warnOnProbableKeyMismatch(code: string | undefined): void {
  if (keyMismatchWarned || code !== 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED') {
    return
  }

  keyMismatchWarned = true
  console.error(
    '[auth] a well-formed token failed signature verification. If this is every request rather ' +
      'than one, SUPABASE_JWT_SECRET or SUPABASE_JWT_JWKS_URL has drifted from the GoTrue signing key.',
  )
}
