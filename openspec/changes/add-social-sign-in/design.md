# Design

## Context

See proposal.md for why. This design starts from the state `harden-auth-codes` (change 1) leaves, on top of `migrate-supabase-keys` (publishable and secret API keys, asymmetric JWT signing keys, and `supabaseAuthServer(event)`, the auth-only secret-key client that forwards the client address), and uses change 1's contracts as that change's design states them:

- `src/lib/auth/reauth/reauth.server.ts`: `ReauthAction`, `ReauthCaller`, `await reauthCaller()` (which runs `requireLiveSession()` first), `writeGrant(caller, action, target, 'email_code')`, `spendGrant`, `hasGrant`. This change adds the `identity.link` and `identity.unlink` actions (target = bare provider), `writeGrant`'s `'apple'` method and `bindLinkGrant` (decision 6). The `auth.identities` trigger (`guard_auth_identity`, change 1's rule 6) already spends grants of those two actions, an `identity.link` grant only once rebound to `<provider>:<sub>` and only for that identity; change 2 peeks with `hasGrant` and binds on its own verified link flow (decision 6), and never spends one itself. The trigger also lets GoTrue's own `email` identity for the account's current address in without a grant. The trigger also allows, with no grant, an identity insert whose provider owns the account's email domain and whose address equals the account's; the list is `public.provider_owned_domains(provider)`.
- `src/lib/auth/codes/CodeEntry.svelte` with its `alternatives` snippet, and `src/lib/auth/reauth/ReauthStep.svelte` (`action`, `target`, a bindable `confirmed`, `alternatives` passed through), which peeks `reauthGrantStatus` on mount, mails no code when a grant is live, and otherwise mails one only on "Send code" or through its `require()` when the action answers `reauthRequired`; a confirmation only sets `confirmed` and the screen's own submit runs the action; callers key it on action and target.
- `src/lib/hooks/crossSite.server.ts`: `crossSiteGuard` refuses a cookie-carrying non-GET request whose `Sec-Fetch-Site` is not `same-origin`; its `CROSS_SITE_EXEMPT` list already names `POST /auth/callback/apple`.
- `src/lib/auth/server/events.server.ts`: `AuthEventKind` (text column, widened without a migration), `recordAuthEvent`, the spike alert.
- `src/lib/auth/methods/methods.server.ts`: `signInMethods(authUserId)` returning `{ hasPassword, providers }`.
- `src/lib/auth/server/session.server.ts`: `isSessionLive` and `requireLiveSession`. Page loads are not checked (change 1 checks only auth, account, admin and app-API requests and synced writes), so every handler here that acts for a signed-in caller gets its caller through `reauthCaller()` or calls `requireLiveSession()` itself.
- `src/lib/auth/methods/ProviderBlock.svelte`: rendered by `signin/+page.svelte` and `signup/+page.svelte` under their title and subtitle, empty; the welcome fork's standalone rule hides it with the rest of the page's sign-in content.
- The profile gate in `authGuard` sends a signed-in, profile-less caller to `/auth/profile?next=<path>`; `completeProfile` ends at `signedInRedirectTarget(next)`; `provisionProfile` is called only by the profile step.
- `public.before_user_created_hook` allows `app_metadata.provider` `apple` and `google`; `SIGNUP_MARKER` covers grnyte's email sign-up.
- `contested.server.ts` (`flagContestedSignup`, `revokeContestedPassword`) and `verifyAccessToken`, which refuses any token whose `app_metadata` carries `contested_signup`.

Facts from the code as it stands:

- `authGuard` bounces a signed-in visitor off every `/auth/*` path except `EMAILED_LINK_PATHS` (`src/lib/hooks/auth.server.ts`). Linking and "Confirm with Apple" return to `/auth/callback/*` signed in, so they need the same exemption.
- The Supabase server client (`createServerClient` in the same file) writes its cookies with `@supabase/ssr`'s default `SameSite=Lax` and `Secure` only over https.
- There is no Content Security Policy anywhere (`vercel.json`, `svelte.config.js`, hooks), so nothing restricts `form-action` or `connect-src`. Kit's own CSRF check does apply: it refuses every cross-origin form POST, on `+server.ts` routes too.
- `src/sw.ts` answers every navigation network-first and serves the prerendered `/offline` shell in place when the network fails. No root or `(landing)` layout has a server load, so a client-only page renders inside that shell.
- The privacy notice is per-locale HTML (`src/routes/(landing)/legal/privacy/privacy.{en,de}.html`); section 2.1 lists account data, section 5 the providers, section 9 device storage.
- The invitation screen's `wrongAccount` state (`src/routes/(landing)/invite/accept/+page.svelte`) already has the invited address, the session address and the inviter's name.
- `@supabase/supabase-js` has `signInWithIdToken`, `linkIdentity({ provider, token, nonce })` (ID-token variant, sends `link_identity=true`), `getUserIdentities` and `unlinkIdentity`.

## Goals / Non-Goals

**Goals:**

- Every security property of the own client lives in one module per concern, each with a test seen red: transaction cookie, nonce split, provider pinning, account matching, link conflicts, the Apple confirmation binding, and the destination.
- Change 3 adds an app-started flow by adding one transaction carrier, without editing the start, callback or matching code.

**Non-Goals:**

- No Zero query, no mutator, no schema change and no migration. `auth.identities` and `auth.users` are never synced; every read here is a server read inside a remote function or an endpoint.
- No GoTrue redirect flow code, not even behind a switch (it stays a documented fallback only).

## Decisions

### 1. The code flow runs on grnyte's server with `openid-client`

`openid-client` 6.8.8, exact pin. It does discovery, PKCE (S256), `state` and nonce checks, and the code exchange; our code only decides what each provider gets. PKCE binds Google's code only: Apple's discovery document advertises no `code_challenge_methods_supported` and Apple ignores the challenge, so Apple's code is protected by client authentication (the minted secret), `state` and the nonce. Provider configuration lives in new `src/lib/auth/oauth/providers.server.ts`:

```ts
export type OAuthProvider = 'apple' | 'google'
export function configuredProviders(event: RequestEvent): OAuthProvider[]   // env complete AND event.url.origin === new URL(PUBLIC_ORIGIN).origin, Apple first
export function redirectUri(provider: OAuthProvider): string                // `${PUBLIC_ORIGIN}/auth/callback/${provider}`
export function providerMetadata(provider: OAuthProvider): Promise<ServerMetadata>   // discovery only, cached per process
export function oauthConfiguration(provider: OAuthProvider): Promise<Configuration>  // built per exchange: cached metadata + fresh client auth
export function authorizationParams(provider, locale: string): Record<string, string>
export function appleClientSecret(clientId: string): Promise<string>
export function revokeAppleToken(refreshToken: string, clientId: string): Promise<boolean>
```

- Google: issuer `https://accounts.google.com`, `client_secret_post` with `GOOGLE_CLIENT_SECRET`, scope `openid email`, `prompt=select_account`, `hl=<locale>`.
- Apple: issuer `https://appleid.apple.com`, scope `email` (no `name`, Assumption 9), `response_mode=form_post` (Apple requires it whenever a scope is asked), `locale=en_US` or `de_DE`. The client secret is an ES256 JWT minted per request with `jose` (already a dependency): `iss` = `APPLE_TEAM_ID`, `sub` = client ID, `aud` = `https://appleid.apple.com`, `kid` = `APPLE_KEY_ID`, 5 minutes, key `APPLE_PRIVATE_KEY`. Nothing is rotated. The client ID is a parameter because change 3's native Apple confirmation revokes with the bundle ID.
- `openid-client` binds client authentication into a `Configuration`, so a cached one would freeze Apple's 5-minute secret. Only the discovery `ServerMetadata` is cached; `oauthConfiguration` builds a new `Configuration` for every exchange (`new Configuration(metadata, clientId, undefined, ClientSecretPost(await appleClientSecret(clientId)))` for Apple, `ClientSecretPost(GOOGLE_CLIENT_SECRET)` for Google).
- Who checks the ID token's signature: in the plain code flow `openid-client` fetches no JWKS and does not verify it. For `signin` and `link`, GoTrue verifies the signature when it receives the token (`signInWithIdToken`, `linkIdentity`). For `confirm`, nothing else sees the token; it was received directly from the provider's token endpoint over TLS, in a request authenticated with grnyte's client credentials, which OpenID Connect Core (section 3.1.3.7) allows in place of signature validation. The checks of `iss`, `aud` and the nonce (decision 4, step 3) still run on every intent.
- The redirect URI is built from `PUBLIC_ORIGIN` (`$env/static/public`, already read by `src/lib/email`), never from the request, and origins are compared as `new URL(PUBLIC_ORIGIN).origin`, so a trailing slash cannot hide a match: under ngrok in front of a local server the request is plain http, which Apple refuses, and any host the providers have not registered (a Vercel preview, an alias) would end on the provider's own `redirect_uri_mismatch` page. `configuredProviders(event)` therefore also hides every button when the request's origin is not `PUBLIC_ORIGIN`, and every entry point checks it, not only the buttons: `startOAuth` refuses a provider missing from it, and `signInMethodsQuery` returns it so the settings "Add" rows and `ConfirmWithApple` render only for configured providers. Because `PUBLIC_ORIGIN` is static, local Apple testing builds with it set to the ngrok https origin (which also moves that build's email-link origins) and runs `vite preview` over https with the `Host` header preserved.
- The provider-owned domain list has one definition, change 1's SQL `public.provider_owned_domains(provider)`. `decideSignIn` already runs a privileged `pinnedTx` and calls it there; `signInMethodsQuery` derives its per-provider `relinks` flag from the same call. No TypeScript copy exists.
- Private env through `$env/dynamic/private`, so CI and a local stack without Apple credentials still build; `configuredProviders(event)` is what hides an unconfigured button (Assumption 10).

Rejected: GoTrue's redirect flow (the documented fallback; shows `<ref>.supabase.co`); Google Identity Services and Apple JS (a script before the click); hand-rolled OAuth on `jose` and `fetch` (`openid-client` is the chosen library; PKCE, `state` and `iss` handling are exactly the parts worth not writing).

### 2. One start endpoint, two pinned callbacks, three intents

```text
POST /auth/oauth/apple | /auth/oauth/google        src/routes/(landing)/auth/oauth/[provider=oauthProvider]/+server.ts
POST /auth/callback/apple  (Apple form_post)        src/routes/(landing)/auth/callback/apple/+server.ts  -> 303 to GET
GET  /auth/callback/apple | /auth/callback/google   same files, GET handler
GET  /auth/error?reason=&intent=&from=              src/routes/(landing)/auth/error/+page.svelte (exists; extended)
```

`src/params/oauthProvider.ts` matches `apple` and `google` only. Failures reuse the existing client-only `/auth/error` page, already in `EMAILED_LINK_PATHS` and so reachable signed in, rather than a new permanent address: without `reason` it shows today's invalid-link copy, with one it shows the OAuth reason. The callback paths are literal folders, not a parameter: each file passes its own provider to the shared handler, so the provider is pinned by the route (mix-up defence), and these URLs are registered at Apple and Google and must never move.

The start is a form POST (Assumption 18), so Kit's origin check guards it in a built server and the buttons work without JavaScript. Kit runs that check only outside dev, and change 1's `crossSiteGuard` covers only a cookie-carrying request, so under `npm run dev` an unauthenticated cross-site POST to the start goes through. That is acceptable: all it can do is start a sign-in in the visitor's own browser, and the flow it starts completes only with that browser's sealed state cookie, its PKCE verifier (Google) and its nonce, so a forged start signs nobody into anything. Fields: `intent` (`signin` | `link` | `confirm`), `next`, for `signin` `screen` (`signin` or `signup`, fixed values), and for `confirm` `action`, `target` and `returnTo`. The handler, in new `src/lib/auth/oauth/flow.server.ts`:

```ts
export type OAuthIntent =
  | { kind: 'signin' }
  | { kind: 'link'; caller: ReauthCaller }
  | { kind: 'confirm'; caller: ReauthCaller; action: ReauthAction; target: string }
export async function startOAuth(event: RequestEvent, provider: OAuthProvider, intent: OAuthIntent, next: string | null): Promise<never>  // sets the transaction, 303 to the provider
```

Every intent first: a provider missing from `configuredProviders(event)` starts nothing and lands on `/auth/error?reason=failed`. Per intent: `signin` while signed in redirects to `signedInRedirectTarget(next)` and starts nothing. `link` needs `locals.claims` and `locals.user`, and peeks `hasGrant(caller, 'identity.link', provider)`; without a grant it returns to `/settings/sign-in-methods` with nothing started. `confirm` needs `locals.claims`, `provider === 'apple'`, a valid `ReauthAction`, a target of that action's shape, and an Apple identity in `signInMethods`; an `identity.link` or `identity.unlink` target must be a bare provider (`apple` or `google`), because a target already in the bound form `<provider>:<sub>` would write a grant the trigger spends on a direct GoTrue link. The same rule holds on the code path: where this change adds the `identity.*` actions, change 1's `requestReauthCode`, `confirmReauthCode` and `reauthGrantStatus` accept them only with a bare-provider target (task 6.0). The caller is taken from `reauthCaller()`, never from the form.

`returnTo` is never taken raw. One pure, client-safe function in `src/lib/auth/index.ts`, `oauthReturnTarget(path, intent)`, decides it at the start and again wherever it is read back, always from one input, a path. At the start the `signin` handler first turns the posted `screen` into its path (`/auth/signin` or `/auth/signup`, plus the posted `next`). Then: for `signin` the path's pathname must be exactly `/auth/signin` or `/auth/signup`, its `next` is kept only if it passes the same-origin, outside-`/auth` rule, and the result always carries `form=signin` (or `form=signup`) so the installed app's welcome fork, shown only on a bare `/auth/signin`, never catches it; for `link` `/settings/sign-in-methods`; for `confirm` the path if it is a same-origin path outside `/auth`, else `/settings`; an unknown intent gets `/auth/signin?form=signin`. It runs on the client-only error page too, where `URL.parse` (Safari 18, Chrome 126, Firefox 126) is missing below the browser floor in `vite.config.ts` (`safari16.4`, `chrome111`, `firefox115`). Rather than a second copy of the open-redirect rule, the simpler of the two options: one client-safe helper in `src/lib/auth/index.ts`, `sameOriginPath(raw): string | null`, which `isSameOriginPath`, `signedInRedirectTarget` and `oauthReturnTarget` all call, so there is one copy. It refuses any control character before parsing (the URL parser strips tabs and newlines, which would let `/\t/evil.example` through as a string), parses with `new URL(raw, REDIRECT_BASE)` inside `try`/`catch` instead of `URL.parse`, requires a leading `/` and the parsed origin to equal the base's (`/\evil.example` resolves to `https://evil.example` under WHATWG parsing and fails here), and returns `pathname + search + hash` reassembled from the parsed URL, never the raw input. This edits `src/lib/auth/index.ts`; `signedInRedirectTarget`'s behaviour is unchanged. It is sealed into the transaction with everything else.

`authGuard` keeps one path list: `EMAILED_LINK_PATHS`, already exempt from the signed-in bounce and from change 1's profile gate and already holding `/auth/error`, is renamed `AUTH_PASSTHROUGH_PATHS` (it no longer holds only emailed links) and gains `/auth/oauth` and `/auth/callback`. On `/auth/callback/*` it also skips `safeGetSession()` and installs anonymous locals, as it already does for `ZERO_API_PREFIX`: the callback does not know whose flow it is until a carrier has claimed the `state`, and loading the session first could rotate a web refresh cookie onto an app-started flow's response. The web carrier loads the session itself, only for `link` and `confirm` (decision 4).

### 3. The transaction: one sealed cookie, Lax, single use

New `src/lib/auth/oauth/transaction.server.ts`:

```ts
export interface OAuthTransaction {
  carrier: 'web'                 // change 3 widens to 'web' | 'app'
  provider: OAuthProvider
  intent: OAuthIntent
  state: string                  // openid-client's randomState()
  nonce: string                  // raw, openid-client's randomNonce(); the provider only ever sees providerNonce(nonce)
  codeVerifier: string           // PKCE toward the provider, openid-client's randomPKCECodeVerifier()
  next: string | null            // validated again at the final redirect, never trusted from a URL
  returnTo: string               // derived per intent, or a validated same-origin path (decision 2); cancel and "Try again" go here
  startedAt: number
}
export interface VerifiedProof {               // what a successful provider return proves
  idToken: string
  rawNonce: string
  claims: IdTokenClaims
  refreshToken?: string                        // Apple only, kept in memory for revocation, never stored
}
export type CallbackResult =
  | { kind: 'proof'; proof: VerifiedProof }
  | { kind: 'cancelled' }
  | { kind: 'failed'; reason: 'expired' | 'failed' }
export interface TransactionCarrier {
  take(event: RequestEvent, state: string): Promise<OAuthTransaction | null>   // single use; null means "not mine", with no side effect for a carrier that holds nothing
  land(event: RequestEvent, tx: OAuthTransaction, result: CallbackResult): Promise<never>
}
export const carriers: TransactionCarrier[]   // [webCarrier]; change 3 puts its app carrier first
```

The web carrier stores the transaction in one cookie, `__Host-grnyte-oauth` over https and `grnyte-oauth` over http (the existing hook already lets `Secure` follow the protocol, because Safari refuses a `Secure` cookie over http and `__Host-` requires it). `HttpOnly`, `Path=/`, `SameSite=Lax`, `Max-Age=600`. The value is sealed by new `src/lib/auth/oauth/seal.server.ts` (`seal(info, value)`, `unseal(info, sealed)`): a JWE (`dir`, `A256GCM`) under a key from change 1's `labelledKey('seal:' + info)` (`src/lib/auth/server/keys.server.ts`, derived from `SUPABASE_SECRET_KEY` like the proof-of-work keys; no secret of its own, so rotating the secret key ends open sign-ins, which live 10 minutes), here with info `grnyte oauth transaction v1` (resolved assumption 7). Change 3 seals its server rows with the same helper and its own info. One cookie per browser: a second start overwrites the first, so two tabs racing lose the older sign-in, which then reads as expired.

The web carrier's `take` deletes the cookie before it decrypts anything and answers null when there is none or it does not decrypt. Carriers are asked in list order; change 3's app carrier goes first because its miss (a lookup by `hash(state)`) has no side effect, while the web carrier spends its cookie on every call. `completeOAuth` then checks, once for every carrier: `state` equals `tx.state` (plain `===`: it is compared with this browser's own sealed copy, so a mismatch reveals nothing worth timing), `startedAt` is under 10 minutes old, and `tx.provider` is the route's provider. Each refusal records `oauth_state_mismatch` (provider mismatch: `oauth_iss_mismatch`) and goes to that carrier's `land` as `failed: expired`; no carrier at all lands on `/auth/error?reason=expired` with no `from`, whose action falls back to `/auth/signin?form=signin`.

Both carriers call GoTrue through the same `supabaseAuthServer(event)`, so the carrier has no client method of its own; `dispatchIntent`'s caller builds the context.

Apple posts its answer cross-site, and a cross-site POST carries no `Lax` cookie, neither ours nor Supabase's session. The Apple POST handler therefore reads only `code`, `state` and `error` from the form and answers 303 to `GET /auth/callback/apple?code=&state=` (or `?error=`), for either carrier. That GET still arrives with `Sec-Fetch-Site: cross-site`, because the redirect chain started at Apple, but `crossSiteGuard` skips GET and browsers send `Lax` cookies on a top-level GET navigation, so link and confirm see the live session and nothing needs `SameSite=None` (resolved assumption 1). The code in the URL is single use and is redeemed only with Apple's client secret, plus `state` and the nonce; Google's query response carries its code the same way, and there PKCE binds it as well. Apple's `user` field (name) is dropped unread.

Two guards see that POST before the handler: change 1's `crossSiteGuard`, whose `CROSS_SITE_EXEMPT` names it, and Kit's own CSRF check, which refuses it as a cross-origin form unless `svelte.config.js` sets `kit.csrf.trustedOrigins: ['https://appleid.apple.com']` (resolved assumption 15). The 303 sets no cookie.

Rejected: a database table for web transactions (a write per sign-in and a sweep, for what one cookie holds); `SameSite=None` on Apple's path (needs the caller sealed into the cookie and still sees no session to link through); `state` itself as the sealed carrier (single use would then need a server record).

### 4. The callback: verify, then hand the ID token to Supabase

`completeOAuth(event, provider)` in `flow.server.ts`, in this order:

1. `take` the transaction from the first carrier that owns `state`, then the state, age and provider checks of decision 3. The transaction is spent from here on, whatever follows.
2. `error` present: `access_denied` (Google) or `user_cancelled_authorize` (Apple) goes to `land` as `cancelled`; anything else as `failed`.
3. `authorizationCodeGrant(await oauthConfiguration(provider), currentUrl, { pkceCodeVerifier, expectedState: tx.state, expectedNonce: providerNonce(tx.nonce), idTokenExpected: true })`, where `currentUrl` is the callback's path and query rebuilt on `PUBLIC_ORIGIN`: the library takes the token request's `redirect_uri` from it, so it equals `buildAuthorizationUrl`'s `redirectUri(provider)` for both carriers and the request's own host never reaches the provider. Then `claims.iss` must equal the provider's issuer and `claims.aud` its client ID, and an `iss` response parameter, when present, must match. If `openid-client` 6.8.8 already checks `iss` and `aud` (task 4.2a reads its source and records the answer here), the library's check is the only one and we keep no duplicate; otherwise we compare them ourselves. The route's provider pin stays either way. Task 4.2a found it does: `authorizationCodeGrant` runs `oauth4webapi`'s `validateAuthResponse` (an `iss` response parameter must equal the metadata issuer) and `validateIdTokenClaims` (`iss` equal to the metadata issuer, `aud` containing the client ID, then the nonce), so `completeOAuth` keeps no comparison of its own and there is no separate mix-up test. A nonce failure records `oauth_nonce_mismatch`, an issuer failure `oauth_iss_mismatch`; both go to `land` as `failed`.
4. `carrier.land(event, tx, { kind: 'proof', proof })`.

What a proof leads to is one exported function, so every carrier runs the same rules:

```ts
export type OAuthOutcome =
  | { kind: 'signedIn'; session: Session }
  | { kind: 'linked' } | { kind: 'confirmed' }
  | { kind: 'refused'; reason: 'exists' | 'conflict_identity' | 'conflict_email' | 'deleted' | 'expired' | 'failed' }
export interface DispatchContext {
  event: RequestEvent
  authServer: AuthServer             // supabaseAuthServer; this change adds signInWithIdToken and refreshSession to its allowlist
  verifiedToken?: VerifiedToken      // the caller's; required for link and confirm
}
export async function dispatchIntent(ctx: DispatchContext, tx: OAuthTransaction, proof: VerifiedProof): Promise<OAuthOutcome>
// signin: decision 5; link: decision 6; confirm: decision 7
```

`dispatchIntent` writes no session anywhere. A `link` or `confirm` without `ctx.verifiedToken` answers `refused: expired` before any call. A `signedIn` outcome carries the session the carrier must hand out, already past the contested refresh (decision 5), and only the carrier's `land` (or change 3's exchange) writes it: the web carrier through `locals.supabase.auth.setSession`. So neither carrier can hand out a flagged token.

Which client makes which GoTrue call, and why:

| Call | Client | Why |
| --- | --- | --- |
| `signInWithIdToken`, `refreshSession` (contested take-over) | `ctx.authServer` (`supabaseAuthServer`) | hit `/token`; the person's address is forwarded so GoTrue's per-IP limit counts them; nothing persisted |
| `linkIdentity` | `supabaseAuthServerAs(event, ctx.verifiedToken)` | acts as the caller, address forwarded |
| `setSession` | `locals.supabase` (web carrier's `land`) | writes the cookie session, which the allowlisted clients never hold |
| `getUserIdentities`, `unlinkIdentity`, `signOut({ scope: 'others' })` (`unlinkProvider`) | `locals.supabase` | act on the caller's own cookie session; not on `/token` |
| `signOut` of the link's throwaway session, `updateUserById` (`clearContestedFlag`) | `supabaseAdmin()` | admin endpoints by an explicit JWT or user id |

`sha256hex(raw)` goes to the provider and raw to Supabase (`signInWithIdToken({ provider, token, nonce: raw })`), because GoTrue compares `hex(sha256(raw))` with the token's nonce. That split is one function, `providerNonce(raw)` (built on the exported `sha256hex(value)` in `providers.server.ts`), called at start and at step 3, so the two sides cannot drift.

The web carrier's `land` handles all three results at once. `cancelled` goes quietly to `tx.returnTo`; `failed` and every refusal except `deleted` (decision 5) to `/auth/error?reason=<reason>&intent=<kind>&from=<tx.returnTo>`, whose page passes `from` through `oauthReturnTarget(from, intent)` again before offering it, so a late "Confirm with Apple" on region deletion offers "Try again" back to that region's deletion screen, and a sign-in started on `/auth/signup` back to `/auth/signup?form=signup`; `proof` first, for `link` and `confirm`, calls `event.locals.safeGetSession()` (the hook skipped it on this path, decision 2) and assigns what it returns to `locals.claims` and `locals.verifiedToken` itself, since `safeGetSession` only returns them; then `dispatchIntent({ event, authServer: supabaseAuthServer(event), verifiedToken: locals.verifiedToken }, tx, proof)`. `supabaseAuthServer` comes from `migrate-supabase-keys` (the auth-only secret-key client that forwards the person's address as `Sb-Forwarded-For`); the table above says which call goes where. `VerifiedToken` is change 1's branded pair of token and claims from one verification, so they cannot be mismatched. `supabaseAuthServer` persists nothing, so `land` writes the outcome's session into the cookies through `locals.supabase.auth.setSession`. A `signedIn` outcome sets the last-used cookie (decision 9) and redirects 303 to `signedInRedirectTarget(tx.next)`; change 1's gate turns that into `/auth/profile?next=...` for a new person (change 1's stated contract). Link lands on `tx.returnTo` with `linked=<provider>` added through `URLSearchParams` on the parsed path, so a query already there (`?step=`) survives; confirm lands on `tx.returnTo` unchanged, where the reopened step's peek shows the confirmation. A refusal lands on the error page with its reason. Change 3's app carrier instead stores the proof and runs `dispatchIntent` later, at its exchange.

### 5. Matching a sign-in to an account

New `src/lib/auth/oauth/linking.server.ts`, privileged reads in one `pinnedTx`, `auth.users` aliased per AGENTS.md:

```ts
export type SignInDecision =
  | { kind: 'known' }                                  // (provider, sub) already an identity
  | { kind: 'new' }                                    // no account has the address
  | { kind: 'unconfirmed' }                            // GoTrue takes the unconfirmed account over
  | { kind: 'providerDomain' }                         // provider-owned domain: auto-link allowed
  | { kind: 'refuse' }                                 // confirmed account, no identity for this provider
export async function decideSignIn(provider: OAuthProvider, claims: { sub: string; email?: string }): Promise<SignInDecision>
// providerDomain: the lower-cased domain is in public.provider_owned_domains(provider), read in the same pinnedTx
```

`refuse` records `oauth_link_refused` (detail `{ provider, reason: 'confirmed_account' }`) and answers `refused: exists` (resolved assumption 11). Otherwise `signInWithIdToken` runs. When it succeeds for an account with change 1's deletion marker (`hasDeletionMarker`), the branch ends that session with `supabaseAdmin().auth.admin.signOut(accessToken, 'local')` and answers `refused: deleted`, so no carrier hands out a session for a deleted account, web or app (change 1's `signIn` does the same before `setSession`). The web carrier's `land` sends `refused: deleted` to change 1's `/auth/signin?deleted=1`, which already shows `auth_accountDeleted`, not to `/auth/error`. For `providerDomain` nothing else happens first: change 1's trigger lets GoTrue's identity insert through when the provider owns the domain and the token's address equals the account's (resolved assumption 2), and refuses it otherwise, so a mismatch between `decideSignIn` and the database fails closed as `failed`. A consequence, accepted: once a provider at an address it owns has been unlinked, the next "Continue with" sign-in with that provider takes the same path and links it again. No record of unlinked providers is kept; the inline Remove step says so instead (`settings_signInMethodsRelinks`, decision 8).

After `signInWithIdToken`, when `isContested(user.app_metadata)` (an unconfirmed contested account GoTrue just took over), `clearContestedFlag(authUserId)` (new export in `src/lib/auth/server/contested.server.ts`, admin `updateUserById` with `app_metadata: { contested_signup: null }`) runs, then `ctx.authServer.refreshSession({ refresh_token })` with the sign-in's refresh token, because the token GoTrue just issued still carries the flag and `verifyAccessToken` refuses it. The `signedIn` outcome carries that refreshed session, never the first one. Change 1 keeps `refreshSession` on `locals.supabase`; this change departs from that for this one call, adding it to `supabaseAuthServer`'s allowlist, because `dispatchIntent` must not write a session (only the carrier's `land` does), the app carrier has no cookie client at all, and the call should count against the person's own address. GoTrue has already nulled the stranger's password and removed the email identity; a server test against the second local stack's GoTrue pins both.

GoTrue's errors (`provider_email_needs_verification`, a hook refusal, a rate limit) land on `?reason=failed`.

### 6. Linking from settings

This change adds to change 1's `reauth.server.ts` what only it calls:

```ts
// ReauthAction gains:
  | 'identity.link'      // target: bare provider ('apple' | 'google'); rebound to `${provider}:${sub}` by bindLinkGrant
  | 'identity.unlink'    // target: bare provider
export async function writeGrant(caller, action, target, method: 'email_code' | 'apple'): Promise<void>   // 'apple': decision 7
export async function bindLinkGrant(caller, provider, sub: string): Promise<boolean> // re-targets the caller's own session's (identity.link, provider) grant
```

Change 1's trigger rule 6 and its SQL tests already name these actions; nothing in the database changes.

The `link` intent, after decision 4's verification:

1. `locals.claims.sub` and `session_id` must equal `tx.intent.caller`, and `isSessionLive` must hold (a session revoked since the start cannot link or confirm); otherwise `?reason=expired`.
2. `hasGrant(caller, 'identity.link', provider)` again; without it, back to the settings screen asking to confirm.
3. `decideLink(caller, provider, claims)` in `linking.server.ts`: `'ok' | 'alreadyLinked' | 'identityElsewhere' | 'emailElsewhere'`. `identityElsewhere` is (provider, sub) on another user; `emailElsewhere` is the provider address equal (lower-cased) to another user's `auth.users.email`. Both refusals record `oauth_link_refused` and land on `?reason=conflict_identity` or `conflict_email`.
4. The token's `sub` must be the subject this flow verified in decision 4 (the same proof, never a value from the request); then `bindLinkGrant(caller, provider, sub)` re-targets the caller's own grant to `<provider>:<sub>`. False (no grant for this session) goes back to the settings screen asking to confirm. Change 1's trigger counts an `identity.link` grant only in that bound form and only for the identity whose `provider_id` equals that `sub`, so the grant can be spent only on this flow: a GoTrue link call made directly with a stolen session and the attacker's own identity finds no grant naming it.
5. `supabaseAuthServerAs(event, ctx.verifiedToken).linkIdentity({ provider, token, nonce: raw })` (change 1's user-scoped sibling of `supabaseAuthServer`), as the caller. The trigger spends the bound grant; GoTrue mails the identity-linked notice; `recordAuthEvent('identity_linked', { detail: { provider } })`.
6. The ID-token link answers with a new GoTrue session for the caller, which auth-js saves into that call's in-memory storage and nobody holds afterwards; its refresh token would stay live until revoked, since sessions have no time limit. The branch signs it out at once with `supabaseAdmin().auth.admin.signOut(linkSession.access_token, 'local')`, which ends that session only; the caller's own cookie session is untouched.

Unlink is a remote command, not an OAuth round trip. New `src/lib/auth/methods/identities.remote.ts`:

```ts
export const signInMethodsQuery = query(async () => ...)
// { hasPassword, configured: OAuthProvider[], providers: { apple, google: { linked, canUnlink, relinks } } }
// relinks: the account's address is in provider_owned_domains(provider) AND the linked identity's own email
// equals the account's address, the exact case the trigger and decideSignIn re-link on the next sign-in
export const unlinkProvider = command(z.object({ provider: z.enum(['apple', 'google']) }), ...)
```

`unlinkProvider` takes its caller from `reauthCaller()` (which covers `requireAuthed`'s check and change 1's live-session check), refuses when GoTrue's identity count is below 2 or no password and no other provider would remain (Assumption 13), peeks `hasGrant(caller, 'identity.unlink', provider)` (else `refuseCommand(formError('auth_reauthRequired'))`), finds the identity through `getUserIdentities()`, and calls `unlinkIdentity`; the trigger spends the grant, GoTrue mails the notice, and it records `identity_unlinked`. When `unlinkIdentity` answers an error (a dropped response after GoTrue committed), it reads `getUserIdentities()` again; if the identity is gone, it runs the rest as for success (event, sign-out of other devices) before answering. For Apple it records `apple_revoke_skipped` unless an `apple_revoked` event for this account with action `identity.unlink` and target `apple` exists from the last 10 minutes (Assumption 4); a revocation made for another action does not count. After a successful unlink it signs the account's other devices out with `locals.supabase.auth.signOut({ scope: 'others' })`, on the caller's own session client, so the caller stays signed in; the success toast adds "Signed out other devices" (`settings_signInMethodsOthersSignedOut`). A link signs nobody out. This is this change's own rule beside change 1's sign-outs after a password change, a reset or an email change.

A first password set through change 1's `changePassword` also writes GoTrue's `email` identity for the account's address (change 1's task 8.4d tests exactly that), so a social-only account that sets a password has two identities and can then remove its provider. The "set a password or add another method first" reason on the screen depends on that.

### 7. "Confirm with Apple"

The `confirm` intent, after decision 4's verification:

```ts
export async function acceptAppleConfirmation(
  caller: ReauthCaller, action: ReauthAction, target: string,
  claims: { sub: string },
): Promise<'granted' | 'wrongAppleId'>
```

in `linking.server.ts`. Checks, all at the point of use: the request's verified `claims.sub` and `session_id` equal the transaction's caller and `isSessionLive` holds (the session check, which the database trigger cannot make); the token's `sub` equals the `provider_id` of the caller's `auth.identities` row with `provider = 'apple'` (else `oauth_sub_mismatch`, `?reason=failed`). The nonce was already checked against this transaction, and the transaction is sealed with its action and target, so the proof is bound to them. Then `writeGrant(caller, action, target, 'apple')`. For `identity.link` and `identity.unlink` this writes the same grant a correct mailed code writes: Confirm with Apple is a confirmer like the code. The trigger still spends every `identity.*` grant, and a link grant still counts only after `bindLinkGrant` (decision 6).

Freshness, accepted: Confirm with Apple proves control of the Apple ID signed in on this browser, not a fresh login. Apple's documented ID token claims include no `auth_time`, and its `iat` is the moment of the code exchange, so no age rule is applied; the only bound is the transaction's 10 minutes, and Apple may confirm without any prompt (see Risks). Which claims Apple actually sends is unverified and is recorded during task 12.2.

When `action` is `account.delete`, or `identity.unlink` with target `apple`, the callback revokes before writing the grant: `revokeAppleToken(tokens.refresh_token, APPLE_SERVICES_ID)` posts to `https://appleid.apple.com/auth/revoke`, records `apple_revoked` (detail `{ provider: 'apple', action, target }`) or `apple_revoke_failed`, and the grant is written either way (Assumption 5). The refresh token lives only in that request's memory.

`ConfirmWithApple.svelte` in `src/lib/auth/` is what each re-auth screen passes as `ReauthStep`'s `alternatives`. It is a `type="button"`, not a form: every `ReauthStep` sits inside the screen's `Form`, a nested `<form>` is invalid HTML, and an inner submit would bubble to `Form`'s handler and run the action. On press it builds a `<form method="post" action="/auth/oauth/apple">` on `document.body` with `intent=confirm`, `action`, `target` and `returnTo` (its `returnTo` prop, by default the current path and query), and submits it. A screen passes the `alternatives` snippet holding it only when the account has Apple and Apple is in `signInMethodsQuery`'s `configured`; otherwise it passes no snippet, and `ReauthStep` reads the snippet's presence as "an alternative exists". As the design canvas draws it: on the account deletion screen and the Apple unlink it is filled (`variant="filled"`: Apple's black on light, white on dark) and first in the "Confirm it's you" card, with a caption under it saying it also disconnects grnyte from the Apple ID, then an "or" divider and the outlined "Send code" (Apple first, Assumption 4); the danger action stays in the header, never beside it. Elsewhere it is Apple's outlined variant (`variant="plain"`). At press it shows its pending state and disables itself and "Send code". Coming back, `ReauthStep`'s grant peek (change 1) sees the grant and mails no code. Screens that pass it: change 1's `settings/account/delete`, `settings/password`, `regions/[regionId]/delete`, `regions/[regionId]/owner/[userId]`, and this change's sign-in-methods rows (the Remove-Apple step filled and first, the Add and Remove-Google steps plain).

This change extends change 1's `ReauthStep` (created by `harden-auth-codes`) in three ways. Change 1 already confirms first on every screen (its decision 2, after the auth screens review): a confirmation only sets `confirmed`, and the screen's own submit runs the action, so "Confirm with Apple" comes before any field is filled and needs no mode of its own here (after an expired confirmation, leaving for Apple does lose what was typed; the mailed code keeps it).

- It renders `alternatives` in its pre-send state too, above "Send code", and only where "Send code" itself would render: a blocked account deletion, which shows no "Send code", shows no "Confirm with Apple" either, so Apple is never revoked for a deletion that cannot run.
- No new prop: screens fold `signInMethodsQuery` having settled (answered or failed) into change 1's `ready` (combined with AND into the screen's existing `ready`: account deletion and region delete keep their preview condition), so `ReauthStep` stays in its reserved-height skeleton until both are known, so whether the Apple row exists is decided before the settled state renders and nothing is inserted above rendered content; a failed query means no alternative, so a broken query never holds a re-auth screen in its skeleton.
- When an `alternatives` snippet is present, `require()` (the action answered `reauthRequired`, for instance after a grant expired) shows the pre-send state with Apple instead of mailing a code at once; without one it mails at once as before. This modifies change 1's requirement "A screen that is already confirmed mails no code" (see the reauthentication spec's MODIFIED delta). After a code entered from that pre-send state the step sets `confirmed` again, as change 1 does, and the action runs on the next submit.

A return from Apple lands on the same screen with a live grant: the mount peek sets `confirmed`, the screen's fields show, and nothing is mailed.

The deletion mail's revocation line reads the same `apple_revoked` event, matched on action `account.delete` and the account's id as target (Assumption 6). For a deletion confirmed by code, this change extends change 1's `deleteAccount`: it already reads `signInMethods` before its transaction (while the identities exist), and after commit it records `apple_revoke_skipped` when the account had Apple and no matching `apple_revoked` event exists from the last 10 minutes.

### 8. Screens and copy

The screens follow `harden-auth-codes`'s design decision 13 and the [design canvas](https://claude.ai/artifact/Q4EcjAYuBQrf6qErWo8ch5) from the auth screens review (2026-11-14); the provider buttons, the "Last used" badge, "Confirm with Apple" and the sign-in methods screen drawn there are this change's.

- `ProviderBlock.svelte` (change 1's file) takes `providers: OAuthProvider[]`, `lastUsed: 'apple' | 'google' | 'email' | null`, `next` and `screen: 'signin' | 'signup'`, and renders the choice step (auth screens review, 2026-11-14: buttons beside the email form did not fit 375 px and competed for attention): one `<form method="post" action="/auth/oauth/<provider>">` per provider, Apple first, with hidden `intent=signin`, `screen` and `next`, then a "Continue with email" link (`auth_continueWithEmail`, "Weiter mit E-Mail", the same size, a neutral outlined style) to the same page with `?method=email` added to the current query. The email form renders only with `?method=email` (the page decides, next bullet); browser back returns to the choice, and `?email=` fills the address. Password managers are unaffected: the choice has no fields and the email step is the same form as before. With `providers` empty (change 1 alone, a preview host) there is no choice and the form renders at once, so no link ever needs `?method=email` to reach it. Self-drawn per both brand guides ([Apple](https://developer.apple.com/design/human-interface-guidelines/sign-in-with-apple), [Google](https://developers.google.com/identity/branding-guidelines)), checked against each guide's checklist including its dark variant: Apple black on light and white on dark; Google `#FFFFFF`/`#747775` stroke on light and `#131314`/`#8E918F` on dark; each guide's typography, logo size and padding; "same size" means one height, width (full) and corner radius for all three buttons; label "Continue with Apple" / "Continue with Google" (`auth_continueWithApple`, `auth_continueWithGoogle`). Logos are inline SVG components (`AppleLogo.svelte`, `GoogleLogo.svelte` beside it), `aria-hidden="true"`; these are brand marks, not lucide icons, so the `Icon` rule does not apply. Labels wrap (`text-balance`, no fixed height) for 200 % zoom. On submit, a small enhancement checks `navigator.onLine` and shows `auth_offline` inline instead of navigating, entering with `slide` at `motion()`; at press the pressed button shows its pending state and the other two are disabled. The "Last used" badge is a pill rendered on the server, sized in `rem`/`em` so it scales with text, so nothing shifts and it has no transition; it sits on the button's top trailing corner, half over its edge, and the choice spaces its buttons 20 px apart so the pill never reaches the button above, and a badged button reserves trailing padding so a label wrapped at 200 % zoom never runs under the pill (the review found a pill under the button, and one on the corner with a 10 px gap, ambiguous); it is a sibling element positioned over the button rather than part of the label, and the button points at it with `aria-describedby`, so the button's accessible name stays exactly "Continue with Apple".
- `(tabs)/+layout.server.ts` (exists, loads nothing today) returns `{ providers: configuredProviders(event), lastUsed }`; each page reads them from `page.data` and passes them, `next` and the screen to `ProviderBlock`. Each page decides its step: with `providers` non-empty, no `method=email` in the query and no `/remote=` parameter in the URL (a submit that ran before JavaScript loaded lands on Kit's `?/remote=` URL without `method`; the URL decides, never the remote form's client state, which Kit keeps on a module-level object across navigations), it renders `ProviderBlock` (the choice) and not the form; otherwise the form. With providers, the email step starts with an "Other ways to sign in" link back to the choice (`auth_otherWays`; the same href rule as the hint's link below), because the installed app has no browser back button. Leaving the email step resets the form element (`form.reset()`, whose `reset` event is what clears Kit's issues; `fields.set` only replaces values) and then reseeds the fields to `{ email: invited }` when an invitation address is in the query, else `{}`; the same reseed runs whenever the email step is entered, because Kit reuses the page component across a `?method` change and the page script's one-time prefill does not run again. Coming back therefore never shows a stale error or a typed password, and an invited address is always filled. The title, subtitle, the `?deleted=1` message and the switch line render on both steps; the failed-sign-in hint only on the form. The two steps share one container with one minimum height and swap in place keyed on the step, the incoming one fading in at `motion()` with no out-transition, so nothing stacks or jumps. Focus follows the swap both ways: to the email field on entering the email step, to the choice's first button on returning. The switch lines drop `method` from the query they carry, so the other screen opens on its own choice; every other parameter (`next`, `email`) is carried as before. A link to `/auth/signin` whose query is empty once `method` is dropped (the switch line from create account's email step, the hint's back link) adds change 1's `form=signin`, so the installed app never lands on the welcome fork from inside the flow. An invitation's `email` survives "Continue with email" but not a provider round trip (the OAuth start keeps only `next`), so after a cancelled Apple or Google attempt the invitee meets an unfilled email form; the invitation's own check still refuses a different address. On `/auth/signin` "Continue with email" takes the badge when `lastUsed === 'email'`; the create-account screen never shows an `email` badge, because its button creates an account rather than signing in.
- `signin/+page.svelte` shows `auth_providerHint` ("Signed up with Apple or Google? Go back and choose it there.") with a back link to the choice below the failed-sign-in message on the email step when `providers.length > 0`.
- The existing `/auth/error/+page.svelte` gains the OAuth reasons: with `reason` in a closed set (`expired`, `failed`, `offline`, `exists`, `conflict_identity`, `conflict_email`; any other value is `failed`) it shows that title and body and one action back to `oauthReturnTarget(from, intent)` (`exists` is provider-neutral, "There's already a grnyte account for this email. Sign in the way you usually do, then add it under Settings › Sign-in methods.", and never shows the address or names the provider: the page has no server load and the redirect carries neither, and an address in the query would land in logs and let anyone craft the claim); without `reason` it shows today's invalid-link copy. On load focus moves to its heading; each reason offers exactly one action; the offline message is `role="status"`. It stays client-renderable with no server load, so the offline shell can show it.
- `/settings/sign-in-methods/+page.svelte`: `PageHeader` outside the query state; rows for password, Apple, Google from `signInMethodsQuery` (a skeleton for three rows, since the count is fixed), each with a status line under its name ("Set" / "Not set", "Connected" / "Not connected"), the Password row drawn by settings' `SettingLink` extended with an optional `description` line (the pattern `MenuRow` already has); the Apple and Google rows carry their own Add or Remove button and the inline step below, which a whole-row `<a>` cannot hold, so the page draws them as plain rows in the same divided `SettingSection` list (name, status line, trailing button), with no new shared component; a provider missing from `configured` shows no "Add". The copy says "Add" and "Remove"; "link" and "unlink" stay the code's and CONTEXT.md's terms. As in the auth screens review's design (change 1, decision 13), not the earlier round-4 wireframe's "Link"/"Unlink", Email row and code sheet: the screen shows a Password row (the email address is not a sign-in method of its own here) and opens re-authentication inline. "Add" and "Remove" open an inline `ReauthStep` under the row (`slide`, `motion()`), and a `?step=<add|remove>-<provider>` on load (the `returnTo` its "Confirm with Apple" carries) reopens that step, mounted without the `slide` (only a press slides it in), whose peek finds the grant and offers the action's own button (each inline step passes `ConfirmWithApple` a `returnTo` with its own `step`; a `step` for a row that no longer has that action, as after the unlink, is ignored); "Add" confirms then submits the start form with `intent=link`; "Remove" confirms then calls `unlinkProvider`. Completion is confirmed in text, never by colour or icon alone: the row's status line changes and a toast names the provider (a link lands with `linked=<provider>`, which the page reads for that toast). When that provider's `relinks` is true, the inline Remove step shows `settings_signInMethodsRelinks` ("You can still sign in with Google, because Google manages this address.") above its confirmation. A disabled remove states why (`settings_signInMethodsLastMethod`). "Set a password" links to `/settings/password`, which titles itself `settings_setPassword` when `hasPassword` is false. Below the rows sit change 1's "Sign out other devices" row (its `signOutOthers`, which asks for no re-authentication, unchanged) and its signed-in devices list (change 1's decision 8), moved here as one section. `settings/+page.svelte`'s "Password" row becomes "Sign-in methods" and change 1's devices section there goes (Assumption 12).
- `invite/accept/+page.svelte`'s `wrongAccount` state uses `invite_addressMismatch({ current, email, inviter })`: "You're signed in as {current}. This invite is for {email}. Continue with that email, or ask {inviter} to invite the address you use." When the inviter is null (a deleted account), the page uses a second whole message, `invite_addressMismatchNoInviter({ current, email, region })`: "…, or ask an admin of {region} to invite the address you use." (the app itself invites nobody, and a phrase spliced into another message breaks German case); `regionName` is already in the page data for every holder of the token, and reaches the copy through `toDisplayName(data.regionName)` (`regionDisplayName` needs a membership row with `synced`, which the invite page does not have), never `regionName ?? ''`; the `wrongAccount` state is only reached with a region name present. `invite_wrongAccount` goes.

### 9. Last-used method

A cookie `grnyte-last-method`, value `apple` | `google` | `email`, `HttpOnly`, `SameSite=Lax`, 400 days (Assumption 8). Written by the web carrier's `land` after it writes the session and by `signIn` in `signin.remote.ts` after its `setSession` (so after change 1's contested and deletion-marker checks); never on a link, a confirmation or a failure. Read by `(tabs)/+layout.server.ts`, which accepts only the three values.

### 10. Offline return

`src/sw.ts`'s navigation handler, on a failed fetch of a path under `/auth/callback/` or `/auth/oauth/`, answers `Response.redirect('/auth/error?reason=offline', 303)` instead of the shell at the callback URL, which would render a 404. That redirect also fails offline and gets the shell in place, which renders the error page client-side.

### 11. Events

`AuthEventKind` widens by `identity_linked`, `identity_unlinked`, `oauth_iss_mismatch`, `oauth_nonce_mismatch`, `oauth_state_mismatch` (reserved by change 1), and `oauth_link_refused`, `oauth_sub_mismatch`, `apple_revoked`, `apple_revoke_failed`, `apple_revoke_skipped` (Assumption 17). The mismatches, `oauth_link_refused` and `oauth_sub_mismatch` are failure kinds for change 1's spike alert. `detail` holds the provider and a reason, and for the three `apple_revoke*` kinds the action and target, never an address or a `sub`. Task 1.6 widens the union and change 1's list of failure kinds in `src/lib/auth/server/events.server.ts`.

### 12. Configuration and `check:prod`

- GoTrue, on the branch's second local Supabase stack (from `migrate-supabase-keys`, with change 1's task 1.1 settings; the shared local compose follows after the release, from the main checkout) and hosted by hand: Apple enabled with client IDs `<APPLE_SERVICES_ID>` first (change 3 appends bundle IDs), Google enabled with the web client ID first, `skip_nonce_check` false for both, `GOTRUE_SECURITY_MANUAL_LINKING_ENABLED=true` (needed for `DELETE /user/identities`; our ID-token link does not read it), identity-linked and identity-unlinked notifications on. GoTrue needs no Apple secret for ID tokens; if the hosted dashboard demands one to enable the provider, a minted 6-month secret goes in once and is never used (risk below).
- `deployment/check-prod.ts`, through change 1's Management API read and its pure `assertAuthConfig(json)` (tested with literal JSON): the provider flags and client ID order, `skip_nonce_check` off, manual linking, both identity notifications. Plus one anonymous GET of the deployed `/auth/signin` asserting both button labels are in the HTML (Assumption 10).
- `vite.config.ts` adds the reserved ngrok static domain suffix to `server.allowedHosts` and `preview.allowedHosts`. Anything that must observe Kit's CSRF check (the Apple `form_post`) is driven against a built server (`vite preview` over https with the `Host` header preserved; the node build is not used here, since without `ORIGIN` set it sees an http origin), because Kit checks nothing under `npm run dev`; ngrok fronts that server, and the build is made with `PUBLIC_ORIGIN` set to the ngrok https origin, since that value is static. `deployment/README.md` gets the ngrok recipe, the Apple Services ID return URLs (prod, ngrok), the relay registration of the From domain and Resend's Return-Path subdomain, and the brand verification steps.
- Secrets: the six provider variables in Bitwarden for dev and prod, `.env.example`, `deployment/SECRETS.md`.

### 13. Contracts for change 3 (`add-native-auth-handoff`)

- Routes stay as in decision 2. An app-started flow returns to the same `/auth/callback/<provider>`, the one URL per provider Apple and Google allow-list; there is no second return URL to register.
- Change 3 puts an app carrier first in `carriers`. Its start, `POST /api/app/v1/oauth/start` (unauthenticated for `signin`, Bearer for `link`), builds an `OAuthTransaction` with `carrier: 'app'`, registers the app's S256 challenge in its own server table keyed by `hash(state)`, builds the provider URL with the same `buildAuthorizationUrl(provider, tx)` from `flow.server.ts` (redirect URI from `redirectUri(provider)`, `PUBLIC_ORIGIN` based), returns it, and sets no cookie. Its `take` claims the row by `hash(state)`; its `land` stores the `VerifiedProof` sealed (`seal`), issues the one-time handoff code and redirects to `rocks.grnyte:/auth?code=`, or to `?error=cancelled|expired|failed`. Its exchange runs `dispatchIntent` with a `DispatchContext` whose `authServer` is `supabaseAuthServer(event)` and whose `verifiedToken` comes from its Bearer, and hands the app exactly the `signedIn` outcome's session (already past the contested refresh).
- The callback path loads no session before a carrier claims the state (decision 2), and the Apple POST bounce sets no cookie, so an app flow passing through the web callback reads and writes no web cookie.
- Reusable as they are: `completeOAuth`, `dispatchIntent`, `providerNonce`, `sha256hex`, `seal`/`unseal`, `decideSignIn`, `decideLink`, `acceptAppleConfirmation`, `revokeAppleToken(refreshToken, clientId)`, `appleClientSecret(clientId)`, `clearContestedFlag`, `oauthReturnTarget`. Native Apple sign-in on iOS (no code flow) builds a `VerifiedProof` from its own ID token, verified with the bundle ID as audience, and calls `dispatchIntent`; native "Confirm with Apple" calls `acceptAppleConfirmation`.
- `OAuthTransaction.carrier` widens to `'web' | 'app'`; nothing else in the transaction changes shape.

### Schema changes

None. No table, column, index, trigger or migration; nothing to backfill and no migration number to coordinate with change 1 (`0148`, `0149`) or change 3 (`0150`). The provider-owned domain list this change reads is change 1's SQL function, called directly.

### Reads, writes, remote functions

- Reads: `signInMethodsQuery` (remote query) and server reads of `auth.identities`/`auth.users` inside endpoints. No Zero query.
- Writes: `unlinkProvider` (remote command); start and callbacks are `+server.ts` endpoints; GoTrue writes identities; change 1's `writeGrant`/`spendGrant` write grants. No mutator, per AGENTS.md (auth and account stay remote functions).

## Risks / Trade-offs

- [A dropped `apple_revoked` write] → `recordAuthEvent` never throws and is best effort, and the revocation happens in the callback, in a request with no transaction the deletion or unlink later shares, so it cannot be written in the same transaction. A lost write records a false `apple_revoke_skipped` and drops the revocation line from the deletion mail. Accepted: both are informational, and Apple's revocation itself is unaffected.

- [Hosted Supabase rate-limits `/token` per IP and, from the server, would throttle sign-ins across people (a known failure case of running the code exchange on the server)] → The sign-in itself (`signInWithIdToken`) and the link go through `supabaseAuthServer` and `supabaseAuthServerAs` (decision 4's table lists the few calls that do not, and why), which forward the person's address (`Sb-Forwarded-For`, with `security_sb_forwarded_for_enabled` on), so the limit counts each person. `migrate-supabase-keys` runbook step 5 proves forwarding on prod, and change 1's task 3.9 proves `/token` sign-in is limited per person there; this change's release step 5 adds the same probe for `signInWithIdToken` (Migration Plan). GoTrue 429s alert admins through change 1's stable log message. `?reason=failed` spikes show in the event log; the fallback is GoTrue's redirect flow, a contained swap of decisions 3 to 4.
- [A browser sends `Origin: null` or none on Apple's `form_post`, so Kit's CSRF check refuses it] → Driven through ngrok against a built server in Safari, Chrome and Firefox before launch (task 12.2). If it happens, the Apple POST handler moves to a path Kit does not check, which is the only reason to revisit.
- [An unlocked device holding both a grnyte session and an Apple session confirms with Apple without any prompt, and Apple publishes no `auth_time` to tell] → Accepted: comparable to the mailed code when Mail is open on the same device. The `sub` and session binding still stop a stolen session using another Apple ID, and the transaction bounds the confirmation to 10 minutes.
- [Removing a provider at an address it owns re-links on the next sign-in with it] → Accepted; the inline Remove step says so (decision 5).
- [The installed PWA's provider round trip lands in a different cookie jar] → The transaction cookie is missing there, so it fails closed as `expired`; the device test decides, and the fallback is raised, not guessed (Assumption 14).
- [GoTrue stops nulling the stranger's password on a take-over, or reorders the link] → Server test against the second local stack's GoTrue (task 5.4).
- [Hosted dashboard requires an Apple secret to enable the provider] → A minted secret goes in once; it is never used by the ID-token path, so its expiry breaks nothing.
- [Two jose majors installed (ours 5, `openid-client`'s 6)] → Server-only; no client bundle cost. Upgrading ours is separate work.
- [A race between `decideSignIn` and GoTrue] → An account created in between is matched by GoTrue alone; the trigger still refuses a link onto a confirmed account without a grant, except at a provider-owned domain with an equal address, which is the case the auto-link exemption allows anyway.
- [Google Workspace addresses are not in `provider_owned_domains`] → By design: only provider-owned domains auto-link; those people link from settings.

## Migration Plan

1. Outside setup first: Apple Developer Program (Individual), App ID with Sign in with Apple, Services ID with the prod and ngrok return URLs, a `.p8` key; Google Cloud OAuth web client with the prod and localhost redirect URIs, consent screen, brand verification started; relay registration of the From domain and Return-Path subdomain.
2. Secrets into Bitwarden (dev, prod) and Vercel.
3. Local: GoTrue provider env, manual linking, notifications; ngrok for Apple.
4. Rehearsed on the second local stack (there is no hosted dev project), then prod by hand: provider client ID lists, manual linking, identity notifications; `npm run check:prod` green.
5. Device tests and the Apple `form_post` browsers; then deploy with changes 1 and 3. In change 1's release window, beside its task 3.9, probe `signInWithIdToken` with throwaway Google accounts: failing sign-ins from one client until GoTrue answers 429, then one from a second client still succeeds; if not, disable both providers (step 6) before `disable_signup=false`.
6. Rollback: disable both providers in GoTrue (buttons then end on `/auth/error?reason=failed`), then revert the deploy. Accounts created with a provider stay usable through forgot password, which sets a first password.

## Open Questions

- Whether Apple honours `locale` on its web authorization page; harmless either way.
