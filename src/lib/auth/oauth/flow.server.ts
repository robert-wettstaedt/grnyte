import { PUBLIC_ORIGIN } from '$env/static/public'
import { isContested, signedInRedirectTarget, type VerifiedToken } from '$lib/auth'
import { appCarrier } from '$lib/auth/app/carrier.server'
import { rememberMethod } from '$lib/auth/methods/lastMethod.server'
import { signInMethods } from '$lib/auth/methods/methods.server'
import { bindLinkGrant, hasGrant, unbindLinkGrant, type ReauthCaller } from '$lib/auth/reauth/reauth.server'
import { supabaseAuthServer, supabaseAuthServerAs, type AuthServer } from '$lib/auth/server/authServer.server'
import { clearContestedFlag, endSession } from '$lib/auth/server/contested.server'
import { recordAuthEvent, type AuthEventKind } from '$lib/auth/server/events.server'
import { hasDeletionMarker } from '$lib/entities/user/provision.server'
import { getLocale } from '$lib/paraglide/runtime'
import type { Session } from '@supabase/supabase-js'
import { redirect, type RequestEvent } from '@sveltejs/kit'
import {
  authorizationCodeGrant,
  calculatePKCECodeChallenge,
  Configuration,
  buildAuthorizationUrl as libraryAuthorizationUrl,
  randomNonce,
  randomPKCECodeVerifier,
  randomState,
} from 'openid-client'
import { acceptAppleConfirmation, decideLink, decideSignIn, isStartingCaller } from './linking.server'
import {
  authorizationParams,
  configuredProviders,
  oauthConfiguration,
  providerClientId,
  providerMetadata,
  providerNonce,
  PROVIDERS,
  redirectUri,
  revokeAppleToken,
  type OAuthProvider,
} from './providers.server'
import {
  takeWebTransaction,
  TRANSACTION_LIFETIME_S,
  writeWebTransaction,
  type CallbackResult,
  type OAuthIntent,
  type OAuthTransaction,
  type TransactionCarrier,
  type VerifiedProof,
} from './transaction.server'

export interface DispatchContext {
  authServer: AuthServer
  event: RequestEvent
  /** The caller's; required for link and confirm. */
  verifiedToken?: VerifiedToken
}

export type OAuthOutcome =
  | { kind: 'confirmed' }
  | { kind: 'linked' }
  | { kind: 'refused'; reason: 'conflict_email' | 'conflict_identity' | 'deleted' | 'exists' | 'expired' | 'failed' }
  | { kind: 'signedIn'; session: Session }

const ERROR_PATH = '/auth/error'

/** The provider's authorization URL for `tx`: the nonce's digest, never the raw value. */
export async function buildAuthorizationUrl(
  provider: OAuthProvider,
  tx: OAuthTransaction,
  locale: string,
): Promise<URL> {
  const config = new Configuration(await providerMetadata(provider), providerClientId(provider))
  return libraryAuthorizationUrl(config, {
    ...authorizationParams(provider, locale),
    nonce: providerNonce(tx.nonce),
    redirect_uri: redirectUri(provider),
    state: tx.state,
    ...(PROVIDERS[provider].pkce
      ? { code_challenge: await calculatePKCECodeChallenge(tx.codeVerifier), code_challenge_method: 'S256' }
      : {}),
  })
}

export async function startOAuth(
  event: RequestEvent,
  provider: OAuthProvider,
  intent: OAuthIntent,
  next: null | string,
  returnTo: string,
): Promise<never> {
  if (!configuredProviders(event).includes(provider)) redirect(303, `${ERROR_PATH}?reason=failed`)
  if (intent.kind === 'signin' && event.locals.claims != null) redirect(303, signedInRedirectTarget(next))
  if (intent.kind === 'link' && !(await hasGrant(intent.caller, 'identity.link', provider))) redirect(303, returnTo)
  // Without Apple there is nothing to confirm with; the screen still offers the code.
  if (intent.kind === 'confirm' && !(await signInMethods(intent.caller.authUserId)).providers.includes('apple')) {
    redirect(303, returnTo)
  }

  const tx: OAuthTransaction = {
    carrier: 'web',
    codeVerifier: randomPKCECodeVerifier(),
    intent,
    next,
    nonce: randomNonce(),
    provider,
    returnTo,
    startedAt: Date.now(),
    state: randomState(),
  }
  const url = await buildAuthorizationUrl(provider, tx, getLocale())
  await writeWebTransaction(event, tx)
  redirect(303, url.href)
}

const CANCELLED = new Set(['access_denied', 'user_cancelled_authorize'])

export async function completeOAuth(event: RequestEvent, provider: OAuthProvider): Promise<never> {
  const params = event.url.searchParams
  const state = params.get('state')
  let found: undefined | { carrier: TransactionCarrier; tx: OAuthTransaction }
  for (const carrier of carriers) {
    const tx = await carrier.take(event, state)
    if (tx != null) {
      found = { carrier, tx }
      break
    }
  }
  if (found == null) redirect(303, `${ERROR_PATH}?reason=expired`)
  const { carrier, tx } = found

  const refusal =
    state !== tx.state || Date.now() - tx.startedAt > TRANSACTION_LIFETIME_S * 1000
      ? 'oauth_state_mismatch'
      : tx.provider !== provider
        ? 'oauth_iss_mismatch'
        : undefined
  if (refusal != null) {
    await recordAuthEvent(refusal, { detail: { provider } })
    return carrier.land(event, tx, { kind: 'failed', reason: 'expired' })
  }

  const error = params.get('error')
  if (error != null) {
    return carrier.land(event, tx, CANCELLED.has(error) ? { kind: 'cancelled' } : { kind: 'failed', reason: 'failed' })
  }
  return carrier.land(event, tx, await exchange(event, tx))
}

/** What a proof leads to, the same for every carrier. Writes no session anywhere. */
export async function dispatchIntent(
  ctx: DispatchContext,
  tx: Pick<OAuthTransaction, 'intent' | 'provider'>,
  proof: VerifiedProof,
): Promise<OAuthOutcome> {
  const { intent } = tx
  if (intent.kind === 'signin') return signIn(ctx, tx.provider, proof)
  if (ctx.verifiedToken == null) return EXPIRED
  if (intent.kind === 'link') return link(ctx.event, ctx.verifiedToken, intent.caller, tx.provider, proof)
  const { action, caller, target } = intent
  const answer = await acceptAppleConfirmation(
    ctx.verifiedToken,
    caller,
    action,
    target,
    proof.claims,
    async () => proof.refreshToken != null && revokeAppleToken(proof.refreshToken, providerClientId('apple')),
  )
  return answer === 'granted' ? { kind: 'confirmed' } : answer === 'expired' ? EXPIRED : FAILED
}

async function signIn(ctx: DispatchContext, provider: OAuthProvider, proof: VerifiedProof): Promise<OAuthOutcome> {
  const decision = await decideSignIn(provider, claimsOf(proof))
  if (decision.kind === 'refuse') {
    await recordAuthEvent('oauth_link_refused', { detail: { provider, reason: 'confirmed_account' } })
    return { kind: 'refused', reason: 'exists' }
  }
  const { data, error } = await ctx.authServer.signInWithIdToken({
    nonce: proof.rawNonce,
    provider,
    token: proof.idToken,
  })
  if (error != null || data.session == null) {
    console.warn(`[oauth] ${provider} signInWithIdToken refused:`, error?.code ?? error?.message)
    return FAILED
  }
  const { session, user } = data
  if (await hasDeletionMarker(user.id)) {
    await endSession(session)
    return { kind: 'refused', reason: 'deleted' }
  }
  return isContested(user.app_metadata) ? takeOver(ctx, user.id, session) : { kind: 'signedIn', session }
}

/** GoTrue just took the unconfirmed account over; its token still carries the flag `verifyAccessToken` refuses. */
async function takeOver(ctx: DispatchContext, authUserId: string, session: Session): Promise<OAuthOutcome> {
  const cleared = await clearContestedFlag(authUserId)
  const refreshed =
    cleared.error == null ? await ctx.authServer.refreshSession({ refresh_token: session.refresh_token }) : undefined
  if (refreshed?.data.session == null) {
    console.warn(`[oauth] contested take-over failed:`, (cleared.error ?? refreshed?.error)?.message)
    await endSession(session)
    return FAILED
  }
  return { kind: 'signedIn', session: refreshed.data.session }
}

const EXPIRED = { kind: 'refused', reason: 'expired' } as const
const FAILED = { kind: 'refused', reason: 'failed' } as const

/** The code grant; openid-client checks state, iss, aud and the nonce. */
async function exchange(event: RequestEvent, tx: OAuthTransaction): Promise<CallbackResult> {
  // On PUBLIC_ORIGIN, so the token request's redirect_uri is `redirectUri` whatever host this ran on.
  const currentUrl = new URL(event.url.pathname + event.url.search, PUBLIC_ORIGIN)
  try {
    const tokens = await authorizationCodeGrant(await oauthConfiguration(tx.provider), currentUrl, {
      expectedNonce: providerNonce(tx.nonce),
      expectedState: tx.state,
      idTokenExpected: true,
      pkceCodeVerifier: PROVIDERS[tx.provider].pkce ? tx.codeVerifier : undefined,
    })
    const claims = tokens.claims()
    if (claims == null || tokens.id_token == null) return { kind: 'failed', reason: 'failed' }
    const proof: VerifiedProof = { claims, idToken: tokens.id_token, rawNonce: tx.nonce }
    if (PROVIDERS[tx.provider].refreshToken && tokens.refresh_token != null) proof.refreshToken = tokens.refresh_token
    return { kind: 'proof', proof }
  } catch (cause) {
    const kind = mismatchKind(cause)
    const iss = refusedIssuer(cause)
    if (kind != null)
      await recordAuthEvent(kind, { detail: { provider: tx.provider, ...(iss == null ? {} : { iss }) } })
    else console.warn(`[oauth] ${tx.provider} exchange failed:`, cause)
    return { kind: 'failed', reason: 'failed' }
  }
}

/** Adds the verified identity to the caller who started the flow, spending their bound grant. */
async function link(
  event: RequestEvent,
  token: VerifiedToken,
  caller: ReauthCaller,
  provider: OAuthProvider,
  proof: VerifiedProof,
): Promise<OAuthOutcome> {
  if (!(await isStartingCaller(token, caller))) return EXPIRED

  const decision = await decideLink(caller.authUserId, provider, claimsOf(proof))
  if (decision === 'alreadyLinked') return { kind: 'linked' }
  if (decision !== 'ok') {
    const reason = decision === 'identityElsewhere' ? 'conflict_identity' : 'conflict_email'
    await recordAuthEvent('oauth_link_refused', { authUserId: caller.authUserId, detail: { provider, reason } })
    return { kind: 'refused', reason }
  }
  // Without this session's grant (none, or spent) the settings step asks to confirm again.
  if (!(await bindLinkGrant(caller, provider, proof.claims.sub))) return EXPIRED
  if (!(await linkAtGoTrue(event, token, provider, proof))) {
    // A link that happened spent the grant in GoTrue's transaction, so this restores only an unspent one.
    await unbindLinkGrant(caller, provider, proof.claims.sub)
    return FAILED
  }
  await recordAuthEvent('identity_linked', { authUserId: caller.authUserId, detail: { provider } })
  return { kind: 'linked' }
}

async function linkAtGoTrue(
  event: RequestEvent,
  token: VerifiedToken,
  provider: OAuthProvider,
  proof: VerifiedProof,
): Promise<boolean> {
  const { data, error } = await supabaseAuthServerAs(event, token).linkIdentity({
    nonce: proof.rawNonce,
    provider,
    token: proof.idToken,
  })
  if (error != null || data.session == null) {
    console.warn(`[oauth] ${provider} linkIdentity refused:`, error?.code ?? error?.message)
    return false
  }
  // The ID-token link answers with a fresh session nobody holds; its refresh token would live on.
  await endSession(data.session)
  return true
}

const MISMATCHES: Record<string, AuthEventKind> = {
  aud: 'oauth_iss_mismatch',
  iss: 'oauth_iss_mismatch',
  nonce: 'oauth_nonce_mismatch',
}

const claimsOf = (proof: VerifiedProof) => ({ email: proof.claims.email as string | undefined, sub: proof.claims.sub })

const causeDetail = (cause: unknown): object => Object(Object(Object(cause).cause).cause)

/** The library names a mismatched claim two causes down; a mismatched `iss` parameter carries the parameters. */
function mismatchKind(cause: unknown): AuthEventKind | undefined {
  const detail: { claim?: string; parameters?: unknown } = causeDetail(cause)
  return 'parameters' in detail ? 'oauth_iss_mismatch' : MISMATCHES[detail.claim ?? '']
}

// The refused token's issuer: Google documents a legacy bare `accounts.google.com`, which the library refuses.
function refusedIssuer(cause: unknown): string | undefined {
  const detail: { claim?: string; claims?: { iss?: unknown } } = causeDetail(cause)
  return detail.claim === 'iss' && typeof detail.claims?.iss === 'string' ? detail.claims.iss : undefined
}

// A conflict page names the provider ("This Apple ID is on another account"); no other reason does.
const errorPage = (tx: OAuthTransaction, reason: string) =>
  `${ERROR_PATH}?${new URLSearchParams({
    from: tx.returnTo,
    intent: tx.intent.kind,
    reason,
    ...(reason.startsWith('conflict_') ? { provider: tx.provider } : {}),
  })}`

/** `returnTo` with `name=value` added on the parsed path, so a query already there survives. */
function withParam(path: string, name: string, value: string): string {
  const url = new URL(path, PUBLIC_ORIGIN)
  url.searchParams.set(name, value)
  return `${url.pathname}${url.search}${url.hash}`
}

const webCarrier: TransactionCarrier = {
  async land(event, tx, result) {
    if (result.kind === 'cancelled') redirect(303, tx.returnTo)
    if (result.kind === 'failed') redirect(303, errorPage(tx, result.reason))

    const { locals } = event
    if (tx.intent.kind !== 'signin') {
      // The hook skipped the session on this path; only link and confirm need the caller.
      const { claims, verifiedToken } = await locals.safeGetSession()
      locals.claims = claims
      locals.verifiedToken = verifiedToken
    }
    const outcome = await dispatchIntent(
      { authServer: supabaseAuthServer(event), event, verifiedToken: locals.verifiedToken },
      tx,
      result.proof,
    )
    if (outcome.kind === 'confirmed') redirect(303, tx.returnTo)
    if (outcome.kind === 'linked') redirect(303, withParam(tx.returnTo, 'linked', tx.provider))
    if (outcome.kind === 'refused') {
      redirect(303, outcome.reason === 'deleted' ? '/auth/signin?deleted=1' : errorPage(tx, outcome.reason))
    }
    const { error } = await locals.supabase.auth.setSession(outcome.session)
    if (error != null) {
      await endSession(outcome.session)
      redirect(303, errorPage(tx, 'failed'))
    }
    rememberMethod(event.cookies, tx.provider)
    redirect(303, signedInRedirectTarget(tx.next))
  },
  take: (event) => takeWebTransaction(event),
}

/** Asked in order; the app carrier's miss has no side effect, so a web state reaches the web carrier untouched. */
export const carriers: TransactionCarrier[] = [appCarrier, webCarrier]
