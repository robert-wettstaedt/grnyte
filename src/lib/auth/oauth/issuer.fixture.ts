/** The shared fake Apple and Google: discovery, keys and token endpoint, served through `providerHttp`. */
import { exportJWK, exportPKCS8, generateKeyPair, SignJWT, type JWK } from 'jose'
import { providerHttp, type OAuthProvider } from './providers.server'

export const ISSUER: Record<OAuthProvider, string> = {
  apple: 'https://appleid.apple.com',
  google: 'https://accounts.google.com',
}

/** A fixed raw nonce and its SHA-256 hex digest, written out rather than computed. */
export const RAW_NONCE = 'raw-nonce-fixture'
export const RAW_NONCE_DIGEST = '45e72479f0a3fb5b52751b04dbc30966c4330015639f8d2b8c59a06bcd24c7bc'

export interface IdTokenClaims {
  aud?: string
  email?: string
  email_verified?: boolean
  iss?: string
  nonce?: string
  sub?: string
}

export interface TokenRequest {
  body: URLSearchParams
  provider: OAuthProvider
}

const signing = await generateKeyPair('RS256', { extractable: true })
const publicJwk: JWK = { ...(await exportJWK(signing.publicKey)), alg: 'RS256', kid: 'fake-1', use: 'sig' }

/** An ES256 key in `.p8` form for `APPLE_PRIVATE_KEY`, and its public half. */
export const appleKey = await generateKeyPair('ES256', { extractable: true })
export const applePrivateKeyPem = await exportPKCS8(appleKey.privateKey)

/** Every provider variable set, for `vi.stubEnv`. */
export const PROVIDER_ENV = {
  APPLE_KEY_ID: 'APPLEKEY01',
  APPLE_PRIVATE_KEY: applePrivateKeyPem,
  APPLE_SERVICES_ID: 'rocks.grnyte.web',
  APPLE_TEAM_ID: 'TEAM123456',
  GOOGLE_CLIENT_ID: 'google-client.apps.example',
  GOOGLE_CLIENT_SECRET: 'google-secret',
}

/** An ID token as the provider would sign it; `aud` defaults to the client ID the request names. */
export function signIdToken(provider: OAuthProvider, claims: IdTokenClaims, clientId = ''): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({ email_verified: true, ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: publicJwk.kid })
    .setIssuer(claims.iss ?? ISSUER[provider])
    .setAudience(claims.aud ?? clientId)
    .setSubject(claims.sub ?? 'provider-sub-1')
    .setIssuedAt(now)
    .setExpirationTime(now + 600)
    .sign(signing.privateKey)
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' }, status })

/**
 * Installs the fake issuer. `claims` is what the next token answer's ID token carries; its `nonce`
 * defaults to whatever nonce the authorization URL sent, as a real provider echoes it.
 */
export function fakeIssuer() {
  const discoveries: OAuthProvider[] = []
  const tokenRequests: TokenRequest[] = []
  const state = { claims: {} as IdTokenClaims, nonce: undefined as string | undefined, refreshToken: 'apple-refresh' }

  const discover = (provider: OAuthProvider) => {
    discoveries.push(provider)
    return json({
      authorization_endpoint: `${ISSUER[provider]}/authorize`,
      code_challenge_methods_supported: provider === 'google' ? ['S256'] : undefined,
      id_token_signing_alg_values_supported: ['RS256'],
      issuer: ISSUER[provider],
      jwks_uri: `${ISSUER[provider]}/keys`,
      response_modes_supported: ['query', 'fragment', 'form_post'],
      token_endpoint: `${ISSUER[provider]}/token`,
      token_endpoint_auth_methods_supported: ['client_secret_post'],
    })
  }
  const token = async (provider: OAuthProvider, body: URLSearchParams) => {
    tokenRequests.push({ body, provider })
    const idToken = await signIdToken(provider, { nonce: state.nonce, ...state.claims }, body.get('client_id') ?? '')
    const refresh = provider === 'apple' ? { refresh_token: state.refreshToken } : {}
    return json({
      access_token: 'provider-access',
      expires_in: 3600,
      id_token: idToken,
      token_type: 'Bearer',
      ...refresh,
    })
  }
  const routes: Record<string, (provider: OAuthProvider, body: URLSearchParams) => Promise<Response> | Response> = {
    '/.well-known/openid-configuration': discover,
    '/keys': () => json({ keys: [publicJwk] }),
    '/token': token,
  }

  providerHttp.fetch = async (input, init) => {
    const url = new URL(input)
    const provider = (Object.keys(ISSUER) as OAuthProvider[]).find((key) => url.origin === ISSUER[key])
    const route = routes[url.pathname]
    if (provider == null || route == null) throw new Error(`[fake issuer] unexpected request to ${url.href}`)
    return route(provider, new URLSearchParams(String(init.body ?? '')))
  }

  return {
    discoveries,
    /** The next token answer's ID token claims. */
    issue(claims: IdTokenClaims) {
      state.claims = claims
    },
    /** What the authorization URL asked the provider to echo. */
    rememberNonce(nonce: null | string) {
      state.nonce = nonce ?? undefined
    },
    tokenRequests,
  }
}
