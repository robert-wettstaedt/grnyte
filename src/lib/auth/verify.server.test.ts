/**
 * The verifier is a pure function of (token, key), which is what makes it testable in CI at all:
 * the `server` vitest project has no GoTrue to talk to, so a round-trip design would have had zero
 * automated coverage in exactly the place it matters most.
 *
 * Every rejection below is a token that `jwtDecode` accepted, and whose `sub` therefore reached
 * `set_config('request.jwt.claim.sub', ...)` and became `auth.uid()` inside RLS.
 */
import { SUPABASE_JWT_SECRET } from '$env/static/private'
import { verifyAccessToken } from '$lib/auth/verify.server'
import { SignJWT } from 'jose'
import { describe, expect, it } from 'vitest'

const SUB = '00000000-0000-4000-8000-000000000001'
const key = new TextEncoder().encode(SUPABASE_JWT_SECRET)
const otherKey = new TextEncoder().encode('a-different-secret-of-at-least-32-characters')

/** A token shaped like the one GoTrue issues, signed with `signingKey`. */
function token(claims: Record<string, unknown> = {}, { expiresIn = '1h', signingKey = key } = {}): Promise<string> {
  return new SignJWT({ role: 'authenticated', ...claims })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setAudience('authenticated')
    .setSubject(SUB)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(signingKey)
}

/** Splices a header of our choosing onto an otherwise real token, keeping its signature. */
function withHeader(signed: string, header: Record<string, unknown>): string {
  const [, payload, signature] = signed.split('.')
  return `${Buffer.from(JSON.stringify(header)).toString('base64url')}.${payload}.${signature}`
}

describe('verifyAccessToken', () => {
  it('accepts a token signed with the project secret', async () => {
    const result = await verifyAccessToken(await token({ email: 'climber@example.com' }))

    expect(result.ok).toBe(true)
    expect(result.ok && result.claims.sub).toBe(SUB)
    expect(result.ok && result.claims.email).toBe('climber@example.com')
  })

  it('rejects an absent token without calling anything', async () => {
    expect(await verifyAccessToken(undefined)).toEqual({ ok: false, reason: 'absent' })
    expect(await verifyAccessToken('')).toEqual({ ok: false, reason: 'absent' })
  })

  // The exact token the old test harness minted, and the one an attacker writes into the cookie.
  it('rejects an unsigned alg:none token', async () => {
    const segment = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
    const unsigned = `${segment({ alg: 'none', typ: 'JWT' })}.${segment({
      aud: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 3600,
      role: 'authenticated',
      sub: SUB,
    })}.`

    expect(await verifyAccessToken(unsigned)).toEqual({ ok: false, reason: 'invalid' })
  })

  // Algorithm confusion: a real HMAC signature relabelled so a naive verifier picks the wrong key.
  it('rejects an alg:none header spliced onto a valid signature', async () => {
    expect(await verifyAccessToken(withHeader(await token(), { alg: 'none', typ: 'JWT' }))).toEqual({
      ok: false,
      reason: 'invalid',
    })
  })

  it('rejects an RS256 header over an HMAC signature', async () => {
    expect(await verifyAccessToken(withHeader(await token(), { alg: 'RS256', typ: 'JWT' }))).toEqual({
      ok: false,
      reason: 'invalid',
    })
  })

  it('rejects a token signed with a different secret', async () => {
    expect(await verifyAccessToken(await token({}, { signingKey: otherKey }))).toEqual({
      ok: false,
      reason: 'invalid',
    })
  })

  it('rejects a tampered payload', async () => {
    const [header, , signature] = (await token()).split('.')
    const forged = Buffer.from(
      JSON.stringify({ aud: 'authenticated', exp: 9_999_999_999, role: 'authenticated', sub: 'someone-else' }),
    ).toString('base64url')

    expect(await verifyAccessToken(`${header}.${forged}.${signature}`)).toEqual({ ok: false, reason: 'invalid' })
  })

  // Distinguishable on purpose: `safeGetSession` retries a refresh on this one and only this one.
  it('reports expiry separately from invalidity', async () => {
    expect(await verifyAccessToken(await token({}, { expiresIn: '-1h' }))).toEqual({ ok: false, reason: 'expired' })
  })

  it('rejects a token with no exp', async () => {
    const noExp = await new SignJWT({ role: 'authenticated' })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setAudience('authenticated')
      .setSubject(SUB)
      .sign(key)

    expect(await verifyAccessToken(noExp)).toEqual({ ok: false, reason: 'invalid' })
  })

  it('rejects a token with no sub', async () => {
    const noSub = await new SignJWT({ role: 'authenticated' })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setAudience('authenticated')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(key)

    expect(await verifyAccessToken(noSub)).toEqual({ ok: false, reason: 'invalid' })
  })

  it('rejects a service_role token', async () => {
    expect(await verifyAccessToken(await token({ role: 'service_role' }))).toEqual({ ok: false, reason: 'invalid' })
  })

  // The anon API key is a JWT signed with this same secret, and it is published to every browser.
  // It verifies on signature alone, so `audience` and `requiredClaims` are what keep it out.
  it('rejects an anon API key', async () => {
    const anonKey = await new SignJWT({ iss: 'supabase', role: 'anon' })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuedAt()
      .setExpirationTime('10y')
      .sign(key)

    expect(await verifyAccessToken(anonKey)).toEqual({ ok: false, reason: 'invalid' })
  })

  it('rejects a token addressed to another audience', async () => {
    const wrongAudience = await new SignJWT({ role: 'authenticated' })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setAudience('someone-else')
      .setSubject(SUB)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(key)

    expect(await verifyAccessToken(wrongAudience)).toEqual({ ok: false, reason: 'invalid' })
  })

  it('rejects a structurally broken token', async () => {
    expect(await verifyAccessToken('not-a-jwt')).toEqual({ ok: false, reason: 'invalid' })
  })
})
