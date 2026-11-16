import { getRequestEvent } from '$app/server'
import { supabaseAuthServer } from '$lib/auth/authServer.server'
import { recordAuthEvent } from '$lib/auth/events.server'
import { labelledKey } from '$lib/auth/keys.server'
import { buildAuthorizationUrl, dispatchIntent, type OAuthOutcome } from '$lib/auth/oauth/flow.server'
import { configuredProviders, providerNonce, sha256hex, type OAuthProvider } from '$lib/auth/oauth/providers.server'
import { seal, unseal } from '$lib/auth/oauth/seal.server'
import {
  TRANSACTION_LIFETIME_S,
  type OAuthIntent,
  type OAuthTransaction,
  type VerifiedProof,
} from '$lib/auth/oauth/transaction.server'
import { hasGrant, reauthCaller } from '$lib/auth/reauth.server'
import { pinnedTx } from '$lib/db/pinned.server'
import { appAuthFlows } from '$lib/db/serverOnly'
import { formError } from '$lib/forms/schemas'
import type { MessageKey } from '$lib/i18n/message'
import { getLocale } from '$lib/paraglide/runtime'
import { refuseCommand } from '$lib/remote/authed.server'
import { error } from '@sveltejs/kit'
import { and, count, eq, gt, isNull, sql } from 'drizzle-orm'
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { randomNonce, randomPKCECodeVerifier, randomState } from 'openid-client'
import { requireAppleToken } from './appleToken.server'
import { HANDOFF_INFO } from './carrier.server'
import { APP_BUNDLE_ID, APP_RETURNS } from './constants'
import { APP_ERROR_CODES, appSession } from './v1'

/** Open (unclaimed, unexpired) flows one client may hold. */
export const MAX_OPEN_STARTS = 10

const PKCE_CHALLENGE = /^[A-Za-z0-9_-]{43}$/
const CLIENT_KEY = labelledKey('app-start-client')

interface Start {
  codeChallenge: string
  codeChallengeMethod: 'S256'
  provider: OAuthProvider
  purpose: 'link' | 'signin'
  returnChannel: keyof typeof APP_RETURNS
}

/** IPv4 whole (a mapped `::ffff:a.b.c.d` too), IPv6 by its /64: one host can rotate through its prefix. */
function clientKey(address: string): string {
  const bare = address.replace(/%.*$/, '')
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(bare)
  if (mapped != null) return mapped[1]
  if (!bare.includes(':')) return bare
  const [head, tail] = bare.split('::')
  const left = head === '' ? [] : head.split(':')
  const right = tail == null || tail === '' ? [] : tail.split(':')
  const groups = tail == null ? left : [...left, ...Array<string>(8 - left.length - right.length).fill('0'), ...right]
  return `${groups
    .slice(0, 4)
    .map((group) => parseInt(group, 16).toString(16))
    .join(':')}::/64`
}

const clientHash = (address: string) => createHmac('sha256', CLIENT_KEY).update(clientKey(address)).digest('hex')

/** Refuses with `auth_tooManyStarts` while this client holds {@link MAX_OPEN_STARTS} open flows, whoever it signs in as. */
export async function requireStartSlot(hash: string): Promise<void> {
  const [open] = await pinnedTx((db) =>
    db
      .select({ n: count() })
      .from(appAuthFlows)
      .where(
        and(eq(appAuthFlows.clientHash, hash), isNull(appAuthFlows.claimedAt), gt(appAuthFlows.expiresAt, sql`now()`)),
      ),
  )
  if (open.n >= MAX_OPEN_STARTS) error(429, { message: formError('auth_tooManyStarts') })
}

export const startClientHash = () => clientHash(getRequestEvent().getClientAddress())

type Refusal = Extract<OAuthOutcome, { kind: 'refused' }>['reason']

/** `POST oauth/start`: a sealed transaction in a row, the provider URL back (design decision 4). Sets no cookie. */
export async function startAppFlow(input: Start): Promise<{ authorizeUrl: string }> {
  const event = getRequestEvent()
  const { provider, purpose } = input
  if (!configuredProviders(event).includes(provider)) refuseCommand(formError('auth_oauthFailedBody'), 'provider')
  if (!PKCE_CHALLENGE.test(input.codeChallenge)) refuseCommand('invalid_request', 'codeChallenge')
  const intent = purpose === 'link' ? await linkIntent(provider) : ({ kind: 'signin' } as const)
  const hash = startClientHash()
  await requireStartSlot(hash)

  const tx: OAuthTransaction = {
    carrier: 'app',
    codeVerifier: randomPKCECodeVerifier(),
    intent,
    next: null,
    nonce: randomNonce(),
    provider,
    returnTo: APP_RETURNS[input.returnChannel],
    startedAt: Date.now(),
    state: randomState(),
  }
  const sealed = await seal(HANDOFF_INFO, tx)
  await pinnedTx((db) =>
    db.insert(appAuthFlows).values({
      authUserFk: intent.kind === 'link' ? intent.caller.authUserId : undefined,
      clientHash: hash,
      codeChallenge: input.codeChallenge,
      expiresAt: new Date(tx.startedAt + TRANSACTION_LIFETIME_S * 1000),
      provider,
      purpose,
      sessionId: intent.kind === 'link' ? intent.caller.sessionId : undefined,
      stateHash: sha256hex(tx.state),
      transaction: sealed,
    }),
  )
  return { authorizeUrl: (await buildAuthorizationUrl(provider, tx, getLocale())).href }
}

/** A link needs a live Bearer caller with a profile and an `identity.link` grant for the provider. */
async function linkIntent(provider: OAuthProvider): Promise<OAuthIntent> {
  const { locals } = getRequestEvent()
  if (locals.claims == null) error(401, { message: APP_ERROR_CODES.sessionEnded })
  if (locals.user == null) error(403, { message: 'profile_required' })
  const caller = await reauthCaller()
  if (!(await hasGrant(caller, 'identity.link', provider))) error(403, { message: formError('auth_reauthRequired') })
  return { caller, kind: 'link' }
}

// The conflicts name the provider, as the web error page does.
const CONFLICTS: Record<OAuthProvider, Record<Extract<Refusal, `conflict_${string}`>, MessageKey>> = {
  apple: {
    conflict_email: 'auth_oauthConflictEmailBodyApple',
    conflict_identity: 'auth_oauthConflictIdentityBodyApple',
  },
  google: {
    conflict_email: 'auth_oauthConflictEmailBodyGoogle',
    conflict_identity: 'auth_oauthConflictIdentityBodyGoogle',
  },
}

const REFUSALS: Record<Exclude<Refusal, `conflict_${string}`>, MessageKey> = {
  deleted: 'auth_accountDeleted',
  exists: 'auth_oauthExistsBody',
  expired: 'auth_oauthExpiredBody',
  failed: 'auth_oauthFailedBody',
}

type Spent = {
  auth_user_fk: null | string
  code_challenge: null | string
  proof: null | string
  purpose: string
  session_id: null | string
  transaction: null | string
}

async function handoffFailed(reason: string, status: number, key: MessageKey): Promise<never> {
  await recordAuthEvent('handoff_failed', { detail: { reason } })
  error(status, { message: formError(key) })
}

/** Empties the row and keeps it, so `take` still knows its state; the proof comes back exactly once. */
const spendCode = (code: string) =>
  pinnedTx((db) =>
    db.execute<Spent>(sql`
      update app_auth_flows f set code_hash = null, proof = null
      from (select id, proof from app_auth_flows where code_hash = ${sha256hex(code)} for update) old
      where f.id = old.id and f.expires_at > now()
      returning f.purpose, f.code_challenge, f.transaction, old.proof, f.auth_user_fk, f.session_id`),
  )

const pkceMatches = (verifier: string, challenge: null | string) => {
  const sent = Buffer.from(createHash('sha256').update(verifier).digest('base64url'))
  const stored = Buffer.from(challenge ?? '')
  return sent.length === stored.length && timingSafeEqual(sent, stored)
}

type AppOutcome = { linked: true } | { session: ReturnType<typeof appSession> }

/** `POST oauth/exchange`: spend the code, check PKCE and the link caller, then change 2's `dispatchIntent`. */
export async function exchangeAppFlow(input: {
  code: string
  codeVerifier: string
}): Promise<{ linked: true } | { session: ReturnType<typeof appSession> }> {
  const event = getRequestEvent()
  const { locals } = event
  const [row] = await spendCode(input.code)
  if (row == null) return handoffFailed('code_unknown', 400, 'auth_oauthExpiredBody')
  // The code is spent already: a wrong verifier means it reached someone else.
  if (!pkceMatches(input.codeVerifier, row.code_challenge))
    return handoffFailed('pkce_mismatch', 400, 'auth_oauthFailedBody')
  if (
    row.purpose === 'link' &&
    (locals.claims?.sub !== row.auth_user_fk || locals.claims?.session_id !== row.session_id)
  ) {
    return handoffFailed('link_caller_mismatch', 403, 'auth_oauthFailedBody')
  }

  const tx = row.transaction == null ? null : await unseal<OAuthTransaction>(HANDOFF_INFO, row.transaction)
  const proof = row.proof == null ? null : await unseal<VerifiedProof>(HANDOFF_INFO, row.proof)
  if (tx == null || proof == null) return handoffFailed('code_unknown', 400, 'auth_oauthExpiredBody')
  return dispatchForApp(tx, proof)
}

/** Change 2's `dispatchIntent` as the app path runs it: GoTrue sees the app user's address, the session goes in the body. */
async function dispatchForApp(tx: OAuthTransaction, proof: VerifiedProof): Promise<AppOutcome> {
  const event = getRequestEvent()
  const outcome = await dispatchIntent(
    { authServer: supabaseAuthServer(event), event, verifiedToken: event.locals.verifiedToken },
    tx,
    proof,
  )
  if (outcome.kind === 'signedIn') return { session: appSession(outcome.session) }
  if (outcome.kind === 'linked') return { linked: true }
  if (outcome.kind !== 'refused') return refuseCommand(formError('auth_oauthFailedBody'))
  const { reason } = outcome
  const key =
    reason === 'conflict_email' || reason === 'conflict_identity' ? CONFLICTS[tx.provider][reason] : REFUSALS[reason]
  return refuseCommand(formError(key))
}

/** A native Apple ID token as the proof of a transaction that never left the server. */
async function nativeApple(intent: OAuthIntent, input: { idToken: string; rawNonce: string }): Promise<AppOutcome> {
  if (!configuredProviders(getRequestEvent()).includes('apple')) refuseCommand(formError('auth_oauthFailedBody'))
  const claims = await requireAppleToken(input.idToken, APP_BUNDLE_ID, providerNonce(input.rawNonce))
  const tx: OAuthTransaction = {
    carrier: 'app',
    codeVerifier: '',
    intent,
    next: null,
    nonce: input.rawNonce,
    provider: 'apple',
    returnTo: '',
    startedAt: Date.now(),
    state: '',
  }
  return dispatchForApp(tx, { claims, idToken: input.idToken, rawNonce: input.rawNonce })
}

/** `POST oauth/apple/native`: Sign in with Apple on iOS (design decision 5). */
export const signInWithAppleToken = (input: { idToken: string; rawNonce: string }) =>
  nativeApple({ kind: 'signin' }, input)

/** `POST identities/link/apple`: the same token check, then a link for the Bearer caller with its grant. */
export const linkAppleToken = async (input: { idToken: string; rawNonce: string }) =>
  nativeApple(await linkIntent('apple'), input)
