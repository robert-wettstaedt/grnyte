/** The verifier is a pure function of (token, keys), so it is tested here with no GoTrue at all. */
import { env } from '$env/dynamic/private'
import { CONTESTED_SIGNUP, type VerifiedToken } from '$lib/auth'
import { createAccessTokenVerifier, parseBearer, verifyAccessToken } from '$lib/auth/server/verify.server'
import {
  createLocalJWKSet,
  createRemoteJWKSet,
  exportJWK,
  exportSPKI,
  generateKeyPair,
  SignJWT,
  type KeyLike,
} from 'jose'
import { createServer, type Server } from 'node:http'
import { type AddressInfo } from 'node:net'
import { afterAll, describe, expect, it } from 'vitest'

const SUB = '00000000-0000-4000-8000-000000000001'
const SESSION = '00000000-0000-4000-8000-0000000000aa'
const key = new TextEncoder().encode(env.SUPABASE_JWT_SECRET)
const otherKey = new TextEncoder().encode('a-different-secret-of-at-least-32-characters')

interface TokenOptions {
  alg?: string
  /** `null` leaves the claim out. */
  audience?: null | string
  expiresIn?: null | string
  /** Extra protected-header fields, such as `kid` or an embedded `jwk`. */
  header?: Record<string, unknown>
  signingKey?: KeyLike | Uint8Array
  subject?: null | string
}

/** A token shaped like the one GoTrue issues, signed with `signingKey`. */
function token(
  claims: Record<string, unknown> = {},
  {
    alg = 'HS256',
    audience = 'authenticated',
    expiresIn = '1h',
    header = {},
    signingKey = key,
    subject = SUB,
  }: TokenOptions = {},
): Promise<string> {
  const jwt = new SignJWT({ role: 'authenticated', ...claims })
    .setProtectedHeader({ alg, typ: 'JWT', ...header })
    .setIssuedAt()
  if (audience != null) jwt.setAudience(audience)
  if (subject != null) jwt.setSubject(subject)
  if (expiresIn != null) jwt.setExpirationTime(expiresIn)
  return jwt.sign(signingKey)
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

  it('returns the token it checked, branded so a hand-built pair cannot pass for one', async () => {
    const accessToken = await token()
    const result = await verifyAccessToken(accessToken)

    expect(result.ok && result.token).toEqual({ accessToken, claims: result.ok && result.claims })
    if (result.ok) {
      // @ts-expect-error locals' claims beside a token from elsewhere are not a VerifiedToken
      const forged: VerifiedToken = { accessToken: 'from.elsewhere.jwt', claims: result.claims }
      expect(forged).toBeDefined()
    }
  })

  it('refuses a session on a still-contested account, however it was signed in', async () => {
    expect(await verifyAccessToken(await token({ app_metadata: { [CONTESTED_SIGNUP]: true } }))).toEqual({
      ok: false,
      reason: 'invalid',
    })
    expect((await verifyAccessToken(await token({ app_metadata: { provider: 'email' } }))).ok).toBe(true)
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
    expect(await verifyAccessToken(await token({}, { expiresIn: null }))).toEqual({ ok: false, reason: 'invalid' })
  })

  it('rejects a token with no sub', async () => {
    expect(await verifyAccessToken(await token({}, { subject: null }))).toEqual({ ok: false, reason: 'invalid' })
  })

  it('rejects a service_role token', async () => {
    expect(await verifyAccessToken(await token({ role: 'service_role' }))).toEqual({ ok: false, reason: 'invalid' })
  })

  // The anon API key is a JWT signed with this same secret, and it is published to every browser.
  // It verifies on signature alone, so `audience` and `requiredClaims` are what keep it out.
  it('rejects an anon API key', async () => {
    const anonKey = await token({ iss: 'supabase', role: 'anon' }, { audience: null, expiresIn: '10y', subject: null })

    expect(await verifyAccessToken(anonKey)).toEqual({ ok: false, reason: 'invalid' })
  })

  it('rejects a token addressed to another audience', async () => {
    expect(await verifyAccessToken(await token({}, { audience: 'someone-else' }))).toEqual({
      ok: false,
      reason: 'invalid',
    })
  })

  it('rejects a structurally broken token', async () => {
    expect(await verifyAccessToken('not-a-jwt')).toEqual({ ok: false, reason: 'invalid' })
  })
})

// The signing-key migration: GoTrue signs ES256, published as a JWKS, while HS256 tokens may still be out.
const KID = 'grnyte-test-es256'
const published = await generateKeyPair('ES256', { extractable: true })
const unpublished = await generateKeyPair('ES256', { extractable: true })
const jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(published.publicKey)), alg: 'ES256', kid: KID }] })
// The published key's PEM text, the bytes a classic algorithm-confusion attack uses as an HMAC secret.
const publicKeyBytes = new TextEncoder().encode(await exportSPKI(published.publicKey))
const embeddedUnpublished = await exportJWK(unpublished.publicKey)

describe('createAccessTokenVerifier', () => {
  const jwksOnly = createAccessTokenVerifier({ jwks })
  const both = createAccessTokenVerifier({ jwks, secret: key })

  /** An ES256 token with the claims GoTrue puts in a user session. */
  const es256 = (claims: Record<string, unknown> = {}, signingKey: KeyLike = published.privateKey, header = {}) =>
    token(
      {
        aal: 'aal1',
        app_metadata: { provider: 'email' },
        email: 'climber@example.com',
        session_id: SESSION,
        ...claims,
      },
      { alg: 'ES256', header: { kid: KID, ...header }, signingKey },
    )

  it('accepts an ES256 session token against the published key set', async () => {
    const result = await jwksOnly(await es256())

    expect(result.ok).toBe(true)
    expect(result.ok && result.claims.sub).toBe(SUB)
    expect(result.ok && result.claims.session_id).toBe(SESSION)
  })

  it('rejects an ES256 token signed by a key that is not published, even one carrying that key itself', async () => {
    expect(await jwksOnly(await es256({}, unpublished.privateKey))).toEqual({ ok: false, reason: 'invalid' })
    expect(await jwksOnly(await es256({}, unpublished.privateKey, { jwk: embeddedUnpublished }))).toEqual({
      ok: false,
      reason: 'invalid',
    })
  })

  it('rejects HS256 once no secret is configured, including one keyed with the public key', async () => {
    expect(await jwksOnly(await token())).toEqual({ ok: false, reason: 'invalid' })
    expect(await jwksOnly(await token({}, { signingKey: publicKeyBytes }))).toEqual({ ok: false, reason: 'invalid' })
    expect(await both(await token({}, { signingKey: publicKeyBytes }))).toEqual({ ok: false, reason: 'invalid' })
  })

  it('accepts both kinds during the overlap and holds every claim rule for ES256', async () => {
    expect((await both(await token())).ok).toBe(true)
    expect((await both(await es256())).ok).toBe(true)
    expect(await both(await es256({ app_metadata: { [CONTESTED_SIGNUP]: true } }))).toEqual({
      ok: false,
      reason: 'invalid',
    })
    expect(await both(await es256({ role: 'service_role' }))).toEqual({ ok: false, reason: 'invalid' })
  })

  // An outage is not a forgery: callers keep the session and retry instead of signing anyone out.
  describe('with a key set served over HTTP', () => {
    const servers: Server[] = []
    afterAll(() => servers.forEach((server) => server.close()))

    /** A local server answering every request with `status` and `body`; returns its URL. */
    async function serve(status: number, body: unknown): Promise<URL> {
      const server = createServer((_, response) => {
        response.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))
      })
      servers.push(server)
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
      return new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}/jwks.json`)
    }

    const remote = (url: URL) => createAccessTokenVerifier({ jwks: createRemoteJWKSet(url) })

    it('is unavailable when nothing listens', async () => {
      const closed = await serve(200, {})
      await new Promise((resolve) => servers.pop()!.close(resolve))

      expect(await remote(closed)(await es256())).toEqual({ ok: false, reason: 'unavailable' })
    })

    it('is unavailable when the key set answers 500', async () => {
      expect(await remote(await serve(500, { error: 'down' }))(await es256())).toEqual({
        ok: false,
        reason: 'unavailable',
      })
    })

    it('is invalid when the served key set lacks the token key', async () => {
      const other = { ...(await exportJWK(unpublished.publicKey)), alg: 'ES256', kid: 'another-key' }

      expect(await remote(await serve(200, { keys: [other] }))(await es256())).toEqual({
        ok: false,
        reason: 'invalid',
      })
    })
  })
})

describe('parseBearer', () => {
  const read = (authorization?: string) =>
    parseBearer(new Request('https://grnyte.example/', { headers: authorization == null ? {} : { authorization } }))

  it('reads exactly one token after the scheme, matched in any case', () => {
    expect(read('Bearer abc.def.ghi')).toBe('abc.def.ghi')
    expect(read('bearer abc.def.ghi')).toBe('abc.def.ghi')
  })

  it('reads nothing from two tokens, a missing token or no header', () => {
    expect(read('Bearer abc def')).toBeUndefined()
    expect(read('Bearer ')).toBeUndefined()
    expect(read('Bearer')).toBeUndefined()
    expect(read()).toBeUndefined()
  })
})
