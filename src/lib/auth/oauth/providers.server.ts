import { env } from '$env/dynamic/private'
import { PUBLIC_ORIGIN } from '$env/static/public'
import { IDENTITY_TARGETS, type OAuthProvider } from '$lib/auth'
import type { RequestEvent } from '@sveltejs/kit'
import { importPKCS8, SignJWT } from 'jose'
import { createHash } from 'node:crypto'
import {
  ClientSecretPost,
  Configuration,
  customFetch,
  discovery,
  type CustomFetch,
  type ServerMetadata,
} from 'openid-client'

export type { OAuthProvider }

const ISSUERS: Record<OAuthProvider, string> = {
  apple: 'https://appleid.apple.com',
  google: 'https://accounts.google.com',
}

/** A provider shows no button unless every one of its variables is set. */
const ENV_NAMES: Record<OAuthProvider, string[]> = {
  apple: ['APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_PRIVATE_KEY', 'APPLE_SERVICES_ID'],
  google: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
}

/** Where the two providers differ; every other code path reads these fields, never the name. */
export const PROVIDERS: Record<
  OAuthProvider,
  {
    clientId: () => string
    clientSecret: (clientId: string) => Promise<string>
    /** Query parameters of the authorization request. */
    params: (german: boolean) => Record<string, string>
    /** Apple ignores PKCE; its code is bound by the client secret, `state` and the nonce. */
    pkce: boolean
    /** Only Apple's, which `revokeAppleToken` needs. */
    refreshToken: boolean
  }
> = {
  apple: {
    clientId: () => env.APPLE_SERVICES_ID ?? '',
    clientSecret: appleClientSecret,
    params: (german) => ({ locale: german ? 'de_DE' : 'en_US', response_mode: 'form_post', scope: 'email' }),
    pkce: false,
    refreshToken: true,
  },
  google: {
    clientId: () => env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: async () => env.GOOGLE_CLIENT_SECRET ?? '',
    params: (german) => ({ hl: german ? 'de' : 'en', prompt: 'select_account', scope: 'openid email' }),
    pkce: true,
    refreshToken: false,
  },
}

const APPLE_SECRET_LIFETIME_S = 5 * 60

/** The one provider boundary: every call to Apple and Google goes through it. Tests swap it for the fake issuer. */
export const providerHttp: { fetch: CustomFetch } = { fetch: (url, options) => fetch(url, options as RequestInit) }

const throughProviderHttp: CustomFetch = (url, options) => providerHttp.fetch(url, options)

/** Apple first; empty for a request on any origin the providers have not registered. */
export function configuredProviders(event: Pick<RequestEvent, 'url'>): OAuthProvider[] {
  if (event.url.origin !== new URL(PUBLIC_ORIGIN).origin) return []
  return IDENTITY_TARGETS.filter((provider) => ENV_NAMES[provider].every((name) => !!env[name]))
}

export const providerClientId = (provider: OAuthProvider): string => PROVIDERS[provider].clientId()

/** Built from `PUBLIC_ORIGIN`, never the request: the providers allow-list exactly this URL. */
export const redirectUri = (provider: OAuthProvider): string =>
  `${new URL(PUBLIC_ORIGIN).origin}/auth/callback/${provider}`

const metadata = new Map<OAuthProvider, Promise<ServerMetadata>>()

export function authorizationParams(provider: OAuthProvider, locale: string): Record<string, string> {
  return PROVIDERS[provider].params(locale === 'de')
}

/** Per exchange: a cached one would freeze Apple's 5-minute client secret. */
export async function oauthConfiguration(provider: OAuthProvider): Promise<Configuration> {
  const clientId = providerClientId(provider)
  const secret = await PROVIDERS[provider].clientSecret(clientId)
  const config = new Configuration(await providerMetadata(provider), clientId, undefined, ClientSecretPost(secret))
  config[customFetch] = throughProviderHttp
  return config
}

/** Discovery only, cached per process; a failed discovery is retried next time. */
export function providerMetadata(provider: OAuthProvider): Promise<ServerMetadata> {
  let cached = metadata.get(provider)
  if (cached == null) {
    cached = discovery(new URL(ISSUERS[provider]), providerClientId(provider), undefined, undefined, {
      [customFetch]: throughProviderHttp,
    }).then((config) => config.serverMetadata())
    cached.catch(() => metadata.delete(provider))
    metadata.set(provider, cached)
  }
  return cached
}

export const sha256hex = (value: string): string => createHash('sha256').update(value).digest('hex')

/** The provider sees this; Supabase gets the raw value and compares `hex(sha256(raw))` itself. */
export const providerNonce = (raw: string): string => sha256hex(raw)

const APPLE_REVOKE_TIMEOUT_MS = 5000

/** An ES256 JWT minted per request from the `.p8` key, so nothing ever needs rotating. */
export async function appleClientSecret(clientId: string): Promise<string> {
  // A one-line env value carries the PEM's newlines escaped.
  const key = await importPKCS8((env.APPLE_PRIVATE_KEY ?? '').replaceAll(String.raw`\n`, '\n'), 'ES256')
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: env.APPLE_KEY_ID })
    .setIssuer(env.APPLE_TEAM_ID ?? '')
    .setSubject(clientId)
    .setAudience(ISSUERS.apple)
    .setIssuedAt(now)
    .setExpirationTime(now + APPLE_SECRET_LIFETIME_S)
    .sign(key)
}

/** Ends grnyte's access to the Apple ID behind `refreshToken`; false on any non-200 or a timeout. */
export async function revokeAppleToken(refreshToken: string, clientId: string): Promise<boolean> {
  try {
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: await appleClientSecret(clientId),
      token: refreshToken,
      token_type_hint: 'refresh_token',
    })
    const response = await providerHttp.fetch(`${ISSUERS.apple}/auth/revoke`, {
      body,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      method: 'POST',
      redirect: 'manual',
      signal: AbortSignal.timeout(APPLE_REVOKE_TIMEOUT_MS),
    })
    return response.status === 200
  } catch (cause) {
    console.warn('[oauth] apple revoke failed:', cause)
    return false
  }
}
