# Proposal

## Why

Supabase retires the legacy `anon` and `service_role` API keys at the end of 2026
(<https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys>), and grnyte still uses
both everywhere. The project also still signs access tokens with the legacy symmetric JWT secret: the
key that verifies a token is the key that mints one, and that key sits on Vercel
(`SUPABASE_JWT_SECRET`) and on the Zero VPS (`ZERO_AUTH_SECRET`, `PS_SUPABASE_JWT_SECRET`), so anyone
who reads either can forge a token for any user and any role, `service_role` included. Asymmetric
JWT signing keys keep the private key inside Supabase and give every verifier only a public JWKS URL.

The two moves are coupled: the legacy secret cannot be revoked until the legacy API keys (themselves
JWTs signed by it) are disabled (<https://supabase.com/docs/guides/auth/signing-keys>). They ship as
one change, released on its own before `harden-auth-codes`, `add-social-sign-in` and
`add-native-auth-handoff`, which build on the auth-only server client introduced here.

## What Changes

- **Token verification accepts asymmetric keys, then only them.** `src/lib/auth/server/verify.server.ts`
  already selects HS256 or JWKS by header (`resolveKey`, lines 72-85) but its JWKS path has never run
  or been tested. It gains a testable factory, a distinct `unavailable` result when the JWKS cannot
  be fetched (today that reads as a forgery and signs the person out), and tests for the ES256 path,
  a key outside the JWKS, and HS256 once the secret is unset. The secret moves to
  `$env/dynamic/private` so it can be removed from the deployed environment.
- **zero-cache keeps its own check, and swaps its key at rotation; no Zero code changes.** zero-cache
  takes exactly one key option and checks the token and its `sub` against the connection's user id
  before any work (the "door check"). Removing that check was tried and failed its proof (tasks.md
  5.1): a signed-in person joining another person's sync group received that person's stored rows.
  So `ZERO_AUTH_SECRET` stays until "Rotate keys", and within 10 minutes after it a prepared deploy
  swaps it for `ZERO_AUTH_JWKS_URL`, the project's public JWKS. `deploy-zero.yml` gains a guard that
  exactly one key option is set, because two set means no check at all. Accepted, not patched: while
  zero-cache holds the secret, any token with an ES256 header (a forged one too) makes it exit and
  restart (Zero 1.11.0 to 1.12.0), so prod Zero can be restarted by anyone until step 4, and between
  "Rotate keys" and the swap it restarts on every reconnecting ES256 client: Zero sync is down for
  everyone for those minutes.
- **PowerSync accepts both keys through the transition.** `deployment/powersync/service.yaml` adds
  `jwks_uri` beside `supabase_jwt_secret`; the service merges every configured key source. The
  secret leaves once the last pre-rotation token has expired. Local PowerSync on the shared stack
  gets its own `service.local.yaml` that keeps HS256 until that stack is upgraded.
- **New API keys, renamed variables.** `PUBLIC_SUPABASE_ANON_KEY` becomes
  `PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SERVICE_ROLE_KEY` becomes `SUPABASE_SECRET_KEY` in
  every reader: the hook's `createServerClient`, the `(app)` layout's `createBrowserClient`,
  `supabaseAdmin`, `password.server.ts`, `proofOfWork.server.ts`, `check-prod.ts`, the e2e specs,
  `ci.yml`, `post-deploy.yml`, `stryker/server.sh`, `.env.example`. Bitwarden Secrets Manager holds
  both names until the last step, so until step 4 a rollback redeploy of the previous build still
  finds the old ones; from step 4 on only builds from merge B on are valid rollbacks (a pre-B build's
  JWKS path is unproven).
- **The secret key never travels as a Bearer token.** supabase-js sends its key as
  `Authorization: Bearer` on every auth and Storage call (`@supabase/supabase-js/dist/index.mjs:808-815`).
  One `secretKeyFetch` drops that header when it carries an `sb_secret_` key, for `supabaseAdmin`
  and the new client alike. A legacy service-role JWT in the same variable (local stacks, prod
  before step 5) keeps its Bearer, which is the only credential the old gateways accept.
- **New: `supabaseAuthServer(event)`**, an auth-only GoTrue client in
  `src/lib/auth/server/authServer.server.ts` that sends the secret key as `apikey` only, sends
  `Sb-Forwarded-For` from `event.getClientAddress()` and exposes only `resend`, never `auth.admin`. The signup confirmation resend (`mailSignupConfirmation`) moves onto
  it. `security_sb_forwarded_for_enabled` is switched on for the project, with probes recorded in
  the release PR.
- **Proof-of-work keys derive from the secret key.** `proofOfWork.server.ts` reads
  `SUPABASE_SECRET_KEY`, the same variable `supabaseAuthServer` uses.
- **Staging upload sends `apikey`.** The XHR in `upload-manager.svelte.ts` sends only a Bearer user
  token today; it also sends the publishable key, as the new-key docs require.
- **A second local Supabase stack for this branch**, current self-hosted release with publishable
  and secret keys and an asymmetric signing key, beside the shared one, so the worktree runs the new
  keys and the JWKS locally and the rollout is rehearsed there.
- **Rollout runbook** in design.md's Migration Plan (the repo docs keep only lasting facts): three merges and the dashboard, Bitwarden and VPS
  steps between them, each with its rollback; the one coordination window is Zero's key swap right
  after "Rotate keys".
- **BREAKING (operational, not code):** disabling the legacy API keys breaks any client still holding
  the anon key: an open tab or an installed PWA running a bundle from before the key switch. Its next
  token refresh fails and signs that browser out. See Impact.

## Non-goals

- Touching the shared local Supabase stack (`<shared stack>`). It is upgraded from the
  main checkout after merge, and the branch's second stack removed then (Workflow follow-up).
- Any Zero code change, Zero upgrade, or choosing between Zero and PowerSync.
- Moving any other GoTrue call onto `supabaseAuthServer`, or acting as a signed-in user through it:
  the other GoTrue code calls and a user-scoped variant belong to `harden-auth-codes`; sign-in and refresh stay on the cookie client.
- Dropping grnyte's own `verifyAccessToken` for supabase-js `getClaims()`: `getClaims` checks the
  signature only (HS256 falls back to a `getUser` round trip), not `aud`, `role` or whether the
  account's sign-up is contested (another person's unconfirmed sign-up on the same address).
- Edge Functions (none exist), the Data API (unexposed), CI's database (it keeps `ci/shim.sql` and
  HS256 placeholders; the verifier keeps both paths, and ES256 is covered by unit tests).
- No schema change, no migration, no table touched. The `custom_access_token_hook`
  (`drizzle/0000_baseline.sql:562`) runs before signing and is unaffected by the algorithm.

## Capabilities

### New Capabilities

- `auth/access-tokens`: which access tokens grnyte accepts, how they are verified against the
  project's signing keys, how verification fails when keys are missing or unreachable, and that the
  sync servers neither hold a minting key nor serve data to an unverified token.
- `auth/api-keys`: which Supabase API key each component holds, where the secret key may travel,
  and the contract of the auth-only server client that forwards the person's address to GoTrue.

### Modified Capabilities

None. `auth/sign-up-protection` keeps its requirements; only the client its resend uses changes.

## Impact

- **Modules:** `src/lib/auth/server/verify.server.ts` (+ test), new `src/lib/auth/server/authServer.server.ts`
  (+ test), `src/lib/auth/server/mail.server.ts`, `src/lib/hooks/auth.server.ts` (+ test),
  new `src/lib/zero/server/mutateAuth.server.test.ts`, `src/routes/api/zero/get-queries/+server.ts` (+ new
  test), `src/lib/db/supabaseAdmin.server.ts` (+ new test), new `src/lib/db/secretKey.fixture.ts`
  (shared by the two secret-key client tests), `src/lib/entities/user/password.server.ts`,
  `src/lib/forms/bot/proofOfWork.server.ts` (+ new key test), `src/lib/entities/file/upload-manager.svelte.ts`
  (+ test), `src/lib/remote/testHarness.ts`, `src/routes/(app)/+layout.ts`,
  `src/routes/(landing)/auth/(tabs)/signup/signup.remote.ts` and `signup.remote.test.ts`,
  `src/routes/(landing)/auth/forgot-password/forgot-password.remote.ts` and
  `forgot-password.remote.test.ts`, `eslint.config.js`.
- **Ops files:** `docker-compose.yml` (local Zero), `deployment/docker-compose.zero.yml`,
  `deployment/check-prod.ts`, `deployment/powersync/service.yaml`, new
  `deployment/powersync/service.local.yaml`, `deployment/docker-compose.powersync.local.yml`,
  `deployment/SECRETS.md`, `deployment/README.md`, `.github/workflows/{ci,post-deploy,deploy-zero}.yml`,
  `e2e/support.ts`, `e2e/invite.spec.ts`, `e2e/prod-signup.spec.ts`, `stryker/server.sh`, `.env.example`.
- **Outside the repo:** a second Supabase stack under `<local supabase checkout>` (tasks.md group 0);
  the grnyte-dev and grnyte-prod Bitwarden projects.
- **For `harden-auth-codes`:** `supabaseAuthServer` here has no user-scoped option. That change adds
  it, and must not seed a session close to expiry with an empty refresh token: auth-js refreshes a
  stored session within 90 s of `expires_at`. The allowlist holds only `resend`; that change adds
  each method it needs (`verifyOtp`, `resetPasswordForEmail`, `signInWithIdToken`, ...) together
  with its first caller and test.
- **Routes, remote functions, manifest:** no URL, remote export or `manifest.id` changes.
- **Loaded tabs across the deploy:** the publishable key is inlined into the client bundle
  (`$env/static/public`). A tab or installed PWA keeps the bundle it loaded, so it keeps sending the
  old anon key until `serviceWorker.ts` swaps it at the next screen change after an update, or it
  reloads. Nothing breaks while the legacy keys stay enabled; they are disabled only after the wait in
  resolved assumption 4, and that toggle is reversible in the dashboard.
- **Proof-of-work:** open challenges (10 minute TTL) fail once at the secret-key value switch and at
  every later secret-key rotation. `harden-auth-codes` reuses the same derivation.
- **Dashboard and VPS steps** are manual and listed in the runbook: no task automates them.

## Resolved assumptions

1. **zero-cache keeps one key option.** `ZERO_AUTH_SECRET` until "Rotate keys", then
   `ZERO_AUTH_JWKS_URL`, swapped within 10 minutes through deploy-zero's `workflow_dispatch`, with a
   guard that exactly one key option is set (design.md decision 5). Its removal failed proof 5.1(d).
2. **One coordination window, Zero's, at most 10 minutes.** The app and PowerSync accept HS256 and
   ES256 before "Rotate keys" is pressed and drop HS256 only once every HS256 token issued before
   the rotation has expired. zero-cache accepts one kind at a time. Between the rotation and its
   swap, every ES256 client that reconnects restarts zero-cache, so Zero sync is down for everyone
   until the swap lands; queued writes stay on the devices. After the swap an HS256 session waits
   in `needs-auth` and resumes on its next token refresh.
3. **PowerSync holds both key sources through the transition.** Its config collector adds the static
   Supabase secret, every `jwks_uri` and any inline `jwks` to one `CompoundKeyCollector`
   (<https://github.com/powersync-ja/powersync-service/blob/main/packages/service-core/src/util/config/compound-config-collector.ts>).
   The task proves it on the pinned image (1.27.2).
4. **Legacy API keys stay enabled at least 7 days after the key switch deploy**, and until
   Supabase's API logs show no request carrying a legacy key for 24 hours.
5. **Variables are renamed**, and the old names stay in Bitwarden and Vercel until the last step, so a
   rollback redeploy of the previous build (valid until step 4) still reads them.
6. **Proof-of-work HMAC keys derive from `SUPABASE_SECRET_KEY`.** A rotated secret key invalidates
   open challenges, and any derived values of later changes, for their few minutes.
7. **`unavailable` is a new verify result.** A JWKS fetch failure answers anonymously for that
   request but sets `backendUnavailable` (hook), 502 (get-queries) or 401 (mutate, so Zero keeps its
   queued writes) instead of signing the person out. A token whose `kid` is not in the JWKS stays
   `invalid`.
8. **`supabaseAuthServer` ships without a user-scoped option and with one caller** (the signup
   resend), because an export with no caller fails `lint:unused`.
9. **No hosted dev project exists.** Every non-dashboard step is rehearsed on the branch's second
   local stack, with its own zero-cache and PowerSync, including a Rotate rehearsal. Prod is the
   first hosted run, with a rollback per step. Hosted Supabase may behave differently on rotation
   than the self-hosted release; each dashboard step is reversible.
10. **The `Sb-Forwarded-For` probes live here**, because this change switches the setting on. The
    negative probe: a forged `Sb-Forwarded-For` or `X-Forwarded-For` on a direct publishable-key call
    is not honoured. The positive probe: with the secret key and the flag on, exhausting GoTrue's
    verify limit from one forwarded address leaves a second forwarded address able to verify. The
    deployed probe: the app's own resend path with forged `X-Forwarded-For` reaches GoTrue with the
    real address. All are recorded in the release PR. A failed negative probe switches the setting
    off and stops apply.
11. **Hosted JWT expiry is the default 3600 s**, which sets the wait at steps 4b and 8. The runbook
    reads the real value from the dashboard first.
12. **Local dev runs the new keys** on a second stack (self-hosted release `v0.8.3`, 2026-10-16),
    while the shared stack stays as it is. CI keeps the shim and HS256 placeholders.
13. **The follow-up auth changes do not deploy before runbook step 5**, when the secret key is a real
    `sb_secret_*` key and forwarding is honoured.

14. **Withdrawn: the accepted risk of another person's client group.** It assumed the door check was
    removed. Proof 5.1(d) showed rows reaching the second person, so the door check stays, and
    tasks.md 5.1b proves it refuses that connection.
15. **How the merges ship.** The code is written and rehearsed in this worktree, then split into
    `keys/a-deployment` and `keys/b-app` (cut from develop) and `keys/c-powersync` (cut from A), each merged into
    develop only right before its own develop to main release, after `git diff --stat main..develop
-- src/lib/auth src/lib/hooks src/lib/zero src/lib/db/supabaseAdmin.server.ts deployment
.github/workflows eslint.config.js svelte.config.js` lists only that merge's files. A ships only
    after proof 5.1b passed; `keys/z-zero-jwks` (the Zero key swap) through deploy-zero's
    `workflow_dispatch` (which deploys `github.ref_name`) at step 4, then inside C; C only at step
    4b, through `workflow_dispatch` too if develop is not clear, and into main at the next release.
    From step 4 until C is on main, no release touches `deployment/**` or `src/lib/zero/**`, which
    would redeploy the secret. Before each dispatch, `origin/main` is merged into the branch and the
    branch pushed, because a dispatch deploys the pushed branch's whole deployment tree.
    `harden-auth-codes`, `add-social-sign-in` and `add-native-auth-handoff` stay on
    `feature/social-logins` until step 5 is done, so no release carries them early. Other work on
    develop rides along; the pre-release check is the guard, and a step waits while develop holds
    something risky.
16. **grnyte-dev keeps `ZERO_AUTH_SECRET`**: the shared local stack stays HS256, so local
    `npm run dev:zero` keeps its door check.
17. **Grnyte's verifiers lose HS256 at step 4b, Supabase's at step 8.** Between them GoTrue and
    hosted Storage still accept an HS256 token signed with the legacy secret, `service_role`
    included; the secret leaves Vercel at 4b and is revoked at 8.
18. **Every Vercel deployment made before 4b is deleted at 4b**, production and preview, because each
    one inlines or holds the legacy secret and stays reachable at its own URL. After 4b a rollback
    rebuilds and redeploys a merge-B commit; promotion and Instant Rollback are never used.
19. **Withdrawn: no nginx limits.** They were planned for a zero-cache without its door check.
20. **After 4b an expired HS256 token is `invalid`, not `expired`** (jose refuses the algorithm before
    reading `exp`). A device that slept across 4b recovers through the client's `needs-auth` retry,
    which refreshes onto an ES256 token; it is not signed out unless its refresh token has expired too.
