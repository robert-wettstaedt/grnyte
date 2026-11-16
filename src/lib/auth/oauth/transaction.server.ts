import type { ReauthAction } from '$lib/auth'
import type { ReauthCaller } from '$lib/auth/reauth.server'
import type { Cookies, RequestEvent } from '@sveltejs/kit'
import type { IDToken } from 'openid-client'
import type { OAuthProvider } from './providers.server'
import { seal, unseal } from './seal.server'

export type CallbackResult =
  { kind: 'cancelled' } | { kind: 'failed'; reason: 'expired' | 'failed' } | { kind: 'proof'; proof: VerifiedProof }

export type OAuthIntent =
  | { action: ReauthAction; caller: ReauthCaller; kind: 'confirm'; target: string }
  | { caller: ReauthCaller; kind: 'link' }
  | { kind: 'signin' }

export interface OAuthTransaction {
  carrier: 'app' | 'web'
  codeVerifier: string
  intent: OAuthIntent
  /** Validated again at the final redirect, never trusted from a URL. */
  next: null | string
  /** Raw; the provider only ever sees `providerNonce(nonce)`. */
  nonce: string
  provider: OAuthProvider
  /** Where cancel and "Try again" go, from `oauthReturnTarget`. */
  returnTo: string
  startedAt: number
  state: string
}

export interface TransactionCarrier {
  land(event: RequestEvent, tx: OAuthTransaction, result: CallbackResult): Promise<never>
  /** Single use; null means "not mine". */
  take(event: RequestEvent, state: null | string): Promise<null | OAuthTransaction>
}

export interface VerifiedProof {
  claims: IDToken
  idToken: string
  rawNonce: string
  /** Apple only, kept in memory for revocation, never stored. */
  refreshToken?: string
}

export const TRANSACTION_LIFETIME_S = 600
const INFO = 'grnyte oauth transaction v1'

/** `__Host-` needs `Secure`, which Safari refuses over http, so the prefix follows the protocol. */
const cookieName = (url: URL) => (url.protocol === 'https:' ? '__Host-grnyte-oauth' : 'grnyte-oauth')

const cookieOptions = (url: URL) =>
  ({ httpOnly: true, path: '/', sameSite: 'lax', secure: url.protocol === 'https:' }) as const

/** Spends the cookie before decrypting anything; no cookie answers null and sets nothing. */
export async function takeWebTransaction(event: { cookies: Cookies; url: URL }): Promise<null | OAuthTransaction> {
  const name = cookieName(event.url)
  const sealed = event.cookies.get(name)
  if (sealed == null) return null
  event.cookies.delete(name, cookieOptions(event.url))
  return unseal<OAuthTransaction>(INFO, sealed)
}

/** One per browser: a second start overwrites the first, which then reads as expired. */
export async function writeWebTransaction(event: Pick<RequestEvent, 'cookies' | 'url'>, tx: OAuthTransaction) {
  event.cookies.set(cookieName(event.url), await seal(INFO, tx), {
    ...cookieOptions(event.url),
    maxAge: TRANSACTION_LIFETIME_S,
  })
}
