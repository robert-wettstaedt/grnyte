import { env } from '$env/dynamic/private'
import { SUPABASE_JWT_SECRET } from '$env/static/private'
import type { VerifiedClaims } from '$lib/auth'
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'

/**
 * Why a discriminated result rather than a nullable one: `expired` is the single rejection a caller
 * may act on instead of refusing. `getSession()` decides whether to refresh from the COOKIE's
 * `expires_at` field, never from the token's `exp`, and those are two independently client-writable
 * values. When they disagree the session is refreshable and the token is not, and treating that as
 * a forgery signs out a user who is holding a live refresh token.
 */
export type VerifyResult =
  { claims: VerifiedClaims; ok: true } | { ok: false; reason: 'absent' | 'expired' | 'invalid' | 'unconfigured' }

/**
 * The symmetric key, while the project still signs with the legacy JWT secret.
 *
 * Byte-identical to `ZERO_AUTH_SECRET`, and that is provable rather than assumed: the client hands
 * zero-cache this same Supabase access token (`$lib/zero/z.svelte.ts`) and zero-cache HMAC-verifies
 * it against `ZERO_AUTH_SECRET`, so sync working at all proves the two values match.
 *
 * 32 bytes is GoTrue's own documented minimum. Below it the value counts as absent, which fails
 * closed rather than pretending to verify.
 *
 * `?? ''` rather than a bare `.length`: a missing var normally fails the build, because
 * `$env/static/private` is resolved at build time, but any context that imports this module with
 * an incomplete environment would otherwise throw a TypeError here, at import. That takes the whole
 * server down where falling through to "no key configured" degrades every request to anonymous,
 * which is the direction this module is supposed to fail in.
 */
const configuredSecret = SUPABASE_JWT_SECRET ?? ''
const secret = configuredSecret.length >= 32 ? new TextEncoder().encode(configuredSecret) : undefined

/**
 * The asymmetric path, dark until the project moves to JWT signing keys.
 *
 * Built now rather than promised as a one-line swap later, because the swap is triggered by a
 * dashboard click and not by a deploy. Pressing "Rotate keys" makes every newly issued token
 * asymmetric immediately, while the legacy secret keeps verifying the ones already out there. A
 * verifier pinned to HS256 would reject every refreshed session from that instant, with no deploy
 * in between to blame.
 */
const jwksUrl = env.SUPABASE_JWT_JWKS_URL ?? ''
const jwks = jwksUrl.length === 0 ? undefined : createRemoteJWKSet(new URL(jwksUrl))

/** Unset locally on purpose: this stack's GoTrue has no `GOTRUE_JWT_ISSUER`, so local tokens carry
 *  no `iss` at all and pinning one would lock every developer out. Set it in the deployed
 *  environments, where the issuer is stable. Enforced only when configured, and keyed on server
 *  config rather than on the token, so this is not the "omit the claim to skip the check" pattern. */
const issuer = env.SUPABASE_JWT_ISSUER

/** Built from what is actually configured, so unsetting the secret on migration day stops HS256
 *  being accepted at all, rather than leaving a dead branch that still would. */
const algorithms = [...(secret == null ? [] : ['HS256']), ...(jwks == null ? [] : ['ES256', 'RS256'])]

if (algorithms.length === 0) {
  console.error(
    '[auth] FATAL CONFIG: neither SUPABASE_JWT_SECRET nor SUPABASE_JWT_JWKS_URL is usable. ' +
      'Every request will be treated as anonymous.',
  )
}

/**
 * The key for a token, chosen by its header.
 *
 * `alg` is attacker-controlled input, so it selects between configured keys and never dispatches to
 * a key type it should not: an HS256 header only ever reaches the symmetric key, anything else only
 * ever reaches the JWKS. jose additionally refuses a Uint8Array key for an RS256 or ES256 header,
 * so algorithm confusion is foreclosed twice.
 */
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

  return jwks(header, token)
}

/**
 * Verify an access token and return its claims. Never throws.
 *
 * The one place a `sub` becomes trustworthy. `authorize()` and `authorize_in_region()` read only
 * `(auth.jwt() ->> 'sub')`, and that value reaches Postgres through
 * `set_config('request.jwt.claims', ...)`, so nothing may reach `createDrizzle` that did not come
 * out of here.
 *
 * `audience` and `requiredClaims` are load-bearing rather than decoration. This project's `anon`
 * and `service_role` API keys are themselves HS256 JWTs signed with this same secret, and the anon
 * key is public. Both verify on signature alone. Neither carries `aud: 'authenticated'` nor a
 * `sub`, so requiring both is what stops a pasted API key being read as a user session.
 */
export async function verifyAccessToken(accessToken: null | string | undefined): Promise<VerifyResult> {
  if (accessToken == null || accessToken.length === 0) {
    return { ok: false, reason: 'absent' }
  }

  if (algorithms.length === 0) {
    return { ok: false, reason: 'unconfigured' }
  }

  try {
    const { payload } = await jwtVerify(accessToken, resolveKey, {
      algorithms,
      audience: 'authenticated',
      clockTolerance: 5,
      requiredClaims: ['exp', 'sub'],
      ...(issuer == null || issuer.length === 0 ? {} : { issuer }),
    })

    // `requiredClaims` asserts presence, not type or value. `role` is checked here rather than left
    // to `roleFor`: a claim set with a `sub` and no `authenticated` role is not a user session, and
    // rejecting it at the gate gives a clean 401 instead of a 42501 halfway through a transaction.
    if (typeof payload.sub !== 'string' || payload.sub.length === 0 || payload.role !== 'authenticated') {
      return { ok: false, reason: 'invalid' }
    }

    // The only cast that produces the brand, in the only module allowed to.
    return { claims: payload as unknown as VerifiedClaims, ok: true }
  } catch (thrown) {
    const code = (thrown as { code?: string }).code

    if (code === 'ERR_JWT_EXPIRED') {
      return { ok: false, reason: 'expired' }
    }

    warnOnProbableKeyMismatch(code)
    return { ok: false, reason: 'invalid' }
  }
}

/**
 * One line, once per process, when a well-formed token fails on its signature.
 *
 * Secret drift is otherwise invisible and total: every verification fails, `authGuard` drops the
 * session, `/auth` signs the user back in, the next request fails again, and they sit in a redirect
 * loop with nothing logged anywhere. `$env/static/private` is inlined at build time, so pushing a
 * rotated secret without redeploying produces exactly this.
 */
let keyMismatchWarned = false
function warnOnProbableKeyMismatch(code: string | undefined): void {
  if (keyMismatchWarned || code !== 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED') {
    return
  }

  keyMismatchWarned = true
  console.error(
    '[auth] a well-formed token failed signature verification. If this is every request rather ' +
      'than one, SUPABASE_JWT_SECRET has drifted from the GoTrue signing key.',
  )
}
