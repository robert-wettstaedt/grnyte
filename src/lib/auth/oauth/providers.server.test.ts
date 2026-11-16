import { decodeProtectedHeader, jwtVerify } from 'jose'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { appleKey, PROVIDER_ENV, RAW_NONCE, RAW_NONCE_DIGEST } from './issuer.fixture'

const ORIGIN = 'https://grnyte.example'

/** The module under a given `PUBLIC_ORIGIN` and private env, both read at import. */
async function providers(origin = ORIGIN, env: Record<string, string> = PROVIDER_ENV) {
  vi.resetModules()
  vi.doMock('$env/static/public', async (actual) => ({ ...(await actual()), PUBLIC_ORIGIN: origin }))
  vi.doMock('$env/dynamic/private', () => ({ env }))
  return import('./providers.server')
}

const at = (url: string) => ({ url: new URL(url) })

afterEach(() => {
  vi.doUnmock('$env/static/public')
  vi.doUnmock('$env/dynamic/private')
})

describe('authorizationParams', () => {
  it('asks Google to show the account chooser in German', async () => {
    const { authorizationParams } = await providers()

    expect(authorizationParams('google', 'de')).toMatchObject({ hl: 'de', prompt: 'select_account' })
  })

  it('asks Apple for the email only, posted back, in German', async () => {
    const { authorizationParams } = await providers()

    expect(authorizationParams('apple', 'de')).toEqual({ locale: 'de_DE', response_mode: 'form_post', scope: 'email' })
  })
})

describe('redirectUri', () => {
  it('is PUBLIC_ORIGIN plus the callback, whatever the request host', async () => {
    const { redirectUri } = await providers()

    expect(redirectUri('apple')).toBe(`${ORIGIN}/auth/callback/apple`)
  })
})

describe('configuredProviders', () => {
  it('answers Apple, then Google, on PUBLIC_ORIGIN', async () => {
    const { configuredProviders } = await providers()

    expect(configuredProviders(at(`${ORIGIN}/auth/signin`))).toEqual(['apple', 'google'])
  })

  it('drops Apple when one Apple variable is empty', async () => {
    const { configuredProviders } = await providers(ORIGIN, { ...PROVIDER_ENV, APPLE_KEY_ID: '' })

    expect(configuredProviders(at(`${ORIGIN}/auth/signin`))).toEqual(['google'])
  })

  it('answers nothing for a request on another origin', async () => {
    const { configuredProviders } = await providers()

    expect(configuredProviders(at('https://preview.vercel.example/auth/signin'))).toEqual([])
  })

  it('still answers both when PUBLIC_ORIGIN carries a trailing slash', async () => {
    const { configuredProviders } = await providers(`${ORIGIN}/`)

    expect(configuredProviders(at(`${ORIGIN}/auth/signin`))).toEqual(['apple', 'google'])
  })
})

describe('providerNonce', () => {
  it('is the SHA-256 hex digest of the raw value', async () => {
    const { providerNonce } = await providers()

    expect(providerNonce(RAW_NONCE)).toBe(RAW_NONCE_DIGEST)
  })
})

describe('appleClientSecret', () => {
  it('is an ES256 JWT from the team to Apple for the client, living at most 5 minutes', async () => {
    const { appleClientSecret } = await providers()

    const secret = await appleClientSecret('rocks.grnyte.web')
    const { payload } = await jwtVerify(secret, appleKey.publicKey, { algorithms: ['ES256'] })

    expect(decodeProtectedHeader(secret)).toEqual({ alg: 'ES256', kid: 'APPLEKEY01' })
    expect(payload).toMatchObject({ aud: 'https://appleid.apple.com', iss: 'TEAM123456', sub: 'rocks.grnyte.web' })
    expect(payload.exp! - payload.iat!).toBeLessThanOrEqual(300)
  })

  it('is minted per exchange: two exchanges 6 minutes apart each send one valid then, from one discovery', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const { oauthConfiguration } = await providers()
    const { fakeIssuer } = await import('./issuer.fixture')
    const { authorizationCodeGrant } = await import('openid-client')
    const issuer = fakeIssuer()
    issuer.rememberNonce('n')
    const exchange = async () => {
      const callback = new URL(`${ORIGIN}/auth/callback/apple?code=c&state=s`)
      await authorizationCodeGrant(await oauthConfiguration('apple'), callback, {
        expectedNonce: 'n',
        expectedState: 's',
      })
      const secret = issuer.tokenRequests.at(-1)!.body.get('client_secret')!
      return jwtVerify(secret, appleKey.publicKey, { currentDate: new Date() })
    }

    try {
      await exchange()
      vi.setSystemTime(Date.now() + 6 * 60 * 1000)
      await expect(exchange()).resolves.toBeTruthy()
      expect(issuer.discoveries).toEqual(['apple'])
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('revokeAppleToken', () => {
  /** Installs a stub Apple answering `answer`; returns what it was sent. */
  async function stubbed(answer: () => Promise<Response>) {
    const module = await providers()
    const sent: { body: URLSearchParams; url: string }[] = []
    module.providerHttp.fetch = async (url, options) => {
      sent.push({ body: new URLSearchParams(String(options.body)), url })
      return answer()
    }
    return { revoke: module.revokeAppleToken, sent }
  }

  it('posts the refresh token with its hint and a client secret for the given client', async () => {
    const { revoke, sent } = await stubbed(async () => new Response(null, { status: 200 }))

    expect(await revoke('apple-refresh', 'rocks.grnyte.app')).toBe(true)
    expect(sent[0].url).toBe('https://appleid.apple.com/auth/revoke')
    expect(Object.fromEntries(sent[0].body)).toMatchObject({
      client_id: 'rocks.grnyte.app',
      token: 'apple-refresh',
      token_type_hint: 'refresh_token',
    })
    const { payload } = await jwtVerify(sent[0].body.get('client_secret')!, appleKey.publicKey)
    expect(payload.sub).toBe('rocks.grnyte.app')
  })

  it('answers false on a non-200 and on a timeout', async () => {
    expect(await (await stubbed(async () => new Response(null, { status: 400 }))).revoke('t', 'c')).toBe(false)
    const timedOut = await stubbed(() => Promise.reject(new DOMException('timed out', 'TimeoutError')))
    expect(await timedOut.revoke('t', 'c')).toBe(false)
  })
})
