/** A device's Apple ID token against a mock key set, and the native code exchange against the fake issuer. */
import { appleKey, fakeIssuer, PROVIDER_ENV, publicJwk, signIdToken } from '$lib/auth/oauth/issuer.fixture'
import { createLocalJWKSet, generateKeyPair, jwtVerify, SignJWT } from 'jose'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const env = vi.hoisted((): Record<string, string> => ({}))
// fallow-ignore-next-line code-duplication -- vi.mock is hoisted per file: each test that sets provider variables declares its own
vi.mock('$env/dynamic/private', async (actual) => ({
  env: Object.assign(env, (await actual<{ env: Record<string, string> }>()).env),
}))

const { appleKeys, exchangeAppleCode, verifyAppleIdToken } = await import('./appleToken.server')

const AUD = 'rocks.grnyte'
const DIGEST = 'nonce-digest'
const token = (claims: Parameters<typeof signIdToken>[1] = {}) =>
  signIdToken('apple', { aud: AUD, nonce: DIGEST, sub: 'apple-sub-1', ...claims })

async function otherKey() {
  const { privateKey } = await generateKeyPair('RS256')
  return new SignJWT({ nonce: DIGEST })
    .setProtectedHeader({ alg: 'RS256', kid: 'fake-1' })
    .setIssuer('https://appleid.apple.com')
    .setAudience(AUD)
    .setSubject('apple-sub-1')
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(privateKey)
}

const hs256 = () =>
  new SignJWT({ nonce: DIGEST })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('https://appleid.apple.com')
    .setAudience(AUD)
    .setSubject('apple-sub-1')
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(new TextEncoder().encode('a-secret-at-least-32-characters-long!!'))

beforeEach(() => {
  appleKeys.source = createLocalJWKSet({ keys: [publicJwk] })
})

describe('verifyAppleIdToken', () => {
  it('answers the claims of a token Apple signed for this audience and nonce', async () => {
    expect(await verifyAppleIdToken(await token(), AUD, DIGEST)).toMatchObject({
      claims: { sub: 'apple-sub-1' },
      ok: true,
    })
  })

  it.each([
    ['signed by another key', otherKey],
    ['for another audience', () => token({ aud: 'rocks.grnyte.web' })],
    ['from another issuer', () => token({ iss: 'https://evil.example' })],
    ['expired', () => token({ exp: Math.floor(Date.now() / 1000) - 60 })],
    ['carrying another nonce', () => token({ nonce: 'other-digest' })],
    ['signed HS256', hs256],
  ])('refuses a token %s as invalid', async (_case, make) => {
    expect(await verifyAppleIdToken(await make(), AUD, DIGEST)).toEqual({ ok: false, reason: 'invalid' })
  })

  it("answers unavailable when Apple's keys cannot be fetched", async () => {
    appleKeys.source = () => Promise.reject(new Error('ECONNRESET'))

    expect(await verifyAppleIdToken(await token(), AUD, DIGEST)).toEqual({ ok: false, reason: 'unavailable' })
  })
})

describe('exchangeAppleCode', () => {
  it("posts the code with a minted secret and no redirect_uri, and answers the sub of Apple's ID token", async () => {
    Object.assign(env, PROVIDER_ENV)
    const issuer = fakeIssuer()
    issuer.issue({ sub: 'apple-sub-9' })

    expect(await exchangeAppleCode('code-1', AUD)).toEqual({ refreshToken: 'apple-refresh', sub: 'apple-sub-9' })
    const [{ body }] = issuer.tokenRequests
    expect([...body.keys()].sort()).toEqual(['client_id', 'client_secret', 'code', 'grant_type'])
    expect(body.get('grant_type')).toBe('authorization_code')
    expect(body.get('client_id')).toBe(AUD)
    const { payload } = await jwtVerify(body.get('client_secret') ?? '', appleKey.publicKey)
    expect(payload.sub).toBe(AUD)
  })
})
