# Design

## Context

See proposal.md for why. The current state this design starts from:

- **Verification.** `src/lib/auth/server/verify.server.ts` is the only place a `sub` becomes trusted. It
  reads `SUPABASE_JWT_SECRET` from `$env/static/private` (line 2) and an optional
  `SUPABASE_JWT_JWKS_URL` / `SUPABASE_JWT_ISSUER` from `$env/dynamic/private` (lines 44, 51), builds
  `algorithms` from what is configured (line 55) and lets `resolveKey` (lines 72-85) send an HS256
  header only to the secret and anything else only to `createRemoteJWKSet`. It then checks
  `aud: authenticated`, `exp`, `sub`, `role === 'authenticated'` and the contested flag (lines
  110-129; an account is contested while another person's unconfirmed sign-up claims its address).
  Every rejection other than `ERR_JWT_EXPIRED` is `invalid`. Its tests (`verify.server.test.ts`) sign
  only HS256; the JWKS branch has never executed.
- **Callers of the verifier.** The `supabase` handle (`src/lib/hooks/auth.server.ts:206-218`) turns
  any non-ok result into `anonymous()` with `backendUnavailable` taken only from GoTrue errors.
  `zeroCaller` (`src/lib/zero/server/caller.server.ts:14`) verifies the `Authorization` header zero-cache
  forwards to `/api/zero/get-queries` and `/api/zero/mutate`. get-queries answers 502 for `expired`
  (zero-cache retries 502 and 504) and 401 otherwise, and passes `userID: caller.claims.sub` to
  `handleQueryRequest` (`get-queries/+server.ts:26-34`). mutate answers 401 even for expiry, because
  Zero's `needs-auth` state keeps queued writes and resends them after a fresh token, while its error
  state drops them (`mutate.server.ts:25-26`). `testHarness.ts:130-139` mints HS256 tokens for the
  server tests and has no `getClientAddress`.
- **Supabase clients and keys.**
  - `locals.supabase`: `createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY)` over Kit
    cookies (`auth.server.ts:144`).
  - Browser: `createBrowserClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY)`
    (`src/routes/(app)/+layout.ts:20`).
  - `supabaseAdmin()`: `createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)`
    (`src/lib/db/supabaseAdmin.server.ts:6-9`), used for `auth.admin.*` and the Storage sweep.
  - `verifyPassword`: a throwaway anon-key client (`src/lib/entities/user/password.server.ts:13`).
  - `proofOfWork.server.ts:17` derives its altcha HMAC keys from `SUPABASE_SERVICE_ROLE_KEY`.
  - The staging upload XHR (`upload-manager.svelte.ts:238-240`) sends only
    `Authorization: Bearer <access token>`.
  - Outside `src`: `deployment/check-prod.ts:29,35` (anon key as `apikey` on `/auth/v1/settings`),
    `e2e/invite.spec.ts:218`, `e2e/prod-signup.spec.ts:59`, `ci.yml:46-49` and `stryker/server.sh:57-63`
    (placeholders), `post-deploy.yml:68-70` (Bitwarden uuids; the job also runs daily by cron),
    `.env.example:26-54`.
  - The resend tests assert through the `locals.supabase` mock (`signup.remote.test.ts:52-56`,
    `forgot-password.remote.test.ts:40-44`).
- **zero-cache.** Prod runs `rocicorp/zero:1.11.0` (`deployment/docker-compose.zero.yml:41`); the
  citations below are from the installed 1.11.1 package. It reads `ZERO_AUTH_SECRET` from the env
  file `deploy-zero.yml` writes from its uuid allowlist (line 91); the local `docker-compose.yml:38,87`
  passes it too. `deploy-zero.yml` runs on every push to main touching `deployment/**` or
  `src/lib/zero/**` (lines 7-12). Zero marks `auth.secret`, `auth.jwksUrl` and `auth.jwk` deprecated
  (`zero-cache/src/config/zero-config.js:108-121`). It runs its own check (the "door check") only when
  exactly one is set (`server/syncer.js:92`), binding the token's `sub` to the connection's `userID`.
  With none set it still accepts a token-bearing connection when both the mutate and get-queries URLs
  are configured (`workers/syncer.js:336-341`); with two set it silently checks nothing. Each client
  group (a device's tabs sharing one synced store) has a CVR, the server's record of which rows that
  group holds; rows reach the client in `pokePart` messages. The door check is what refuses a valid
  token whose `sub` is not the connection's `userID` before any of the group's rows are sent (tasks.md
  5.1(d)).
- **PowerSync.** `journeyapps/powersync-service:1.27.2` with `client_auth: { supabase: true,
supabase_jwt_secret, audience: ['authenticated'] }` (`deployment/powersync/service.yaml:28-31`).
  Its config collector adds the static Supabase secret, inline `jwks.keys`, each `jwks_uri` and the
  auto-detected Supabase JWKS to one `CompoundKeyCollector`
  (<https://github.com/powersync-ja/powersync-service/blob/main/packages/service-core/src/util/config/compound-config-collector.ts>),
  so it can hold both key kinds at once. Auto-detection reads the project from the connection string
  and, when it cannot, logs a warning and skips the JWKS
  (<https://docs.powersync.com/installation/authentication-setup/supabase-auth>). The shared-stack
  PowerSync (`deployment/docker-compose.powersync.local.yml`) mounts the same `service.yaml`.
- **Library support.** supabase-js 2.112.4 builds its auth and Storage clients with
  `Authorization: Bearer <supabaseKey>` among the default headers
  (`@supabase/supabase-js/dist/index.mjs:808-815`); its `omitApiKeyAsBearer` logic (`index.mjs:269-300`)
  covers Functions only. A custom `global.fetch` sees every request. `auth.getClaims()` verifies
  asymmetric tokens against the JWKS and falls back to a `/user` round trip for HS256
  (`@supabase/auth-js/dist/main/GoTrueClient.js:5335-5364`), but checks no claims. jose's remote
  JWKS throws `ERR_JOSE_GENERIC` for a non-200 or unparsable answer, Node network codes for a failed
  connection, `ERR_JWKS_INVALID` for a malformed set, `ERR_JWKS_TIMEOUT` on timeout.
- **Supabase behaviour** (docs cited in proposal.md, plus
  <https://supabase.com/docs/guides/auth/rate-limits>): "Migrate JWT secret" creates a standby
  asymmetric key that appears in `/auth/v1/.well-known/jwks.json` at once and signs nothing; "Rotate
  keys" makes it sign while unexpired old tokens stay valid; revoking the legacy secret needs the
  legacy API keys disabled first and waiting one token lifetime plus 15 minutes. A revoked key goes
  back with "Move to standby", then "Rotate keys"; every key state change is throttled to one per
  5 minutes, and only deletion is final. The JWKS excludes the symmetric key. Edge caches hold the
  JWKS for 10 minutes. Secret keys answer 401 to a browser `User-Agent`. `Sb-Forwarded-For` is
  honoured only on secret-key requests and only with `security_sb_forwarded_for_enabled` on
  (Authentication > Rate Limits, or `PATCH /v1/projects/{ref}/config/auth`). Verify is limited to 30
  per 5 minutes per IP.
- **Local stacks.** The shared `<shared stack>` runs GoTrue v2.167.0 and Kong 2.8.1
  with `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY` only, plus local edits (custom access token hook,
  a mail overlay, an S3 overlay pinning an older storage image, a db port 5433). Self-hosted new keys
  and signing keys arrived in the 2026-03-16 stack (`JWT_KEYS`, `JWT_JWKS`,
  `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `utils/add-new-auth-keys.sh`, an Envoy gateway,
  <https://supabase.com/docs/guides/self-hosting/self-hosted-auth-keys>). The current releases are
  tagged `self-hosted/v0.8.x` (`docker/CHANGELOG.md`; v0.8.3 2026-10-16 with Auth v2.197.0, v0.8.4
  2026-11-05). Its compose file sets fixed `container_name`s and some fixed host ports, Envoy
  addresses realtime by container name, and its published Postgres port is Supavisor, not the
  database. Vite's dev server answers 403 to any host but `localhost`, `*.localhost` and `.ts.net`
  (`vite.config.ts:282`), so a container reaches it as `localhost` through `host-gateway`
  (`docker-compose.yml:54-56,89`). There is no hosted dev project: grnyte-dev in Bitwarden is the
  laptop environment and grnyte-prod the only hosted one.

## Goals / Non-Goals

**Goals:**

- Code that works unchanged on both sides of every dashboard step, so each step is a configuration
  change or a small merge with its own rollback. The one coordination window is Zero's key swap at
  step 4, at most 10 minutes (decision 5).
- Every security property in the specs pinned by a test or a recorded probe that has been seen red.
- `supabaseAuthServer` defined exactly enough for `harden-auth-codes`, `add-social-sign-in` and
  `add-native-auth-handoff` to build on.
- The worktree runs the new keys and the JWKS locally, and the rollout is rehearsed there.

**Non-Goals:**

- Anything listed under proposal.md Non-goals.
- No Zero query, mutator or remote function is added, renamed or moved. No schema change, no backfill.

## Decisions

### 1. The verifier becomes a factory; the module export stays

`verify.server.ts` exports `createAccessTokenVerifier({ secret, jwks, issuer })` (a `Uint8Array`, a
`JWTVerifyGetKey`, a string, each optional) holding today's body, and builds `verifyAccessToken` from
the environment exactly as now. Tests pass `createLocalJWKSet` over a generated ES256 pair, so the
JWKS path runs in the `server` project with no network. Every caller keeps importing
`verifyAccessToken`.

`SUPABASE_JWT_SECRET` moves from `$env/static/private` to `$env/dynamic/private`, beside the JWKS URL
already there. Static, removing the variable fails the build, so step 4b could not remove the secret,
only blank it. `testHarness.ts` and the test file read the same dynamic value. The stale comments
naming `ZERO_AUTH_SECRET` (lines 19-21) and calling the API keys HS256 JWTs (lines 96-98) are
corrected in the same edit.

Alternative: stub the environment and re-import the module per test. Rejected: `createRemoteJWKSet`
would need a served JWKS, and module-level state makes test order matter.

### 2. A JWKS outage is `unavailable`, not `invalid`

`VerifyResult['reason']` gains `'unavailable'`. jose's error codes do not separate an outage from a
bad token on their own, so the classification is by place: `resolveKey` wraps its `jwks(header,
token)` call in try/catch and rethrows anything except `ERR_JWKS_NO_MATCHING_KEY` and
`ERR_JWKS_MULTIPLE_MATCHING_KEYS` as a local `JwksUnavailable` error, which `verifyAccessToken`
returns as `unavailable`. A `kid` the fetched set lacks, a signature failure and every claim failure
stay `invalid`. Consumers:

- The hook sets `backendUnavailable: true`, which `authGuard` treats as an outage rather than a
  sign-out (`auth.server.ts:320`).
- get-queries answers 502, as for `expired`, so zero-cache retries.
- mutate answers 401, as it does for expiry, so Zero goes to `needs-auth` and keeps queued writes;
  502 would end in Zero's error state and drop them.

jose's defaults stay (`cooldownDuration` 30 s, `cacheMaxAge` 10 min): an unknown `kid` refetches after
the cooldown, so a rotated-in key is picked up without a deploy.

### 3. Rename the variables, keep the old names until the end

`PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY` replace the two old names in every
reader. In CI their values stay placeholders; locally they hold the second stack's new keys; in
grnyte-dev they hold the shared stack's legacy values until it is upgraded. In grnyte-prod both old
and new names exist from step 3 of the runbook to step 9, so until step 4b redeploying the previous
build is a rollback (after 4b, see the Migration Plan). `secrets.mjs` needs no logic change: neither name starts with `ZERO_` or `PS_`, so both
go to Vercel and stay off the VPS. `post-deploy.yml` gains the new uuids and
`node deployment/secrets.mjs verify` proves them.

Lint: the global `no-restricted-imports` block (`eslint.config.js:119-153`) forbids importing
`SUPABASE_SECRET_KEY` from `$env/static/private` (an `importNames` entry, which also catches a
renamed import). A property-only `no-restricted-properties` entry (no `object`) forbids reading
`.SUPABASE_SECRET_KEY` off anything, which covers `env.`, `process.env.` and a namespace import, and
a `no-restricted-syntax` selector forbids a dynamic `import('$env/static/private')`. A new
block for `supabaseAdmin.server.ts`, `authServer.server.ts`, `proofOfWork.server.ts` and `e2e/**`
re-lists the global block's other import paths without that entry and turns the property rule off
(a later flat-config block replaces an earlier one's list, so `'off'` on the import rule would drop
the others). e2e and the daily prod canary build default supabase-js clients, which send the key as
Bearer too: accepted outside server code, and the canary after step 5 is itself the probe that
hosted Supabase takes it.

grnyte-dev keeps `ZERO_AUTH_SECRET`: the shared stack stays HS256, so a main checkout's
`npm run dev:zero` (which reads `.env`) keeps its door check on the stack's secret.

### 4. The secret key never travels as Bearer; `supabaseAuthServer`'s contract

`src/lib/db/supabaseAdmin.server.ts` exports `secretKeyFetch`, a `fetch` that, only when
`SUPABASE_SECRET_KEY` starts with `sb_secret_` (supabase-js's own new-key test), reads the headers
through `new Headers(init?.headers)` (plain object or `Headers`, case-insensitive) and deletes
`Authorization` when it equals `Bearer <SUPABASE_SECRET_KEY>`; everything else passes through, so a
person's own Bearer token survives. A legacy service-role JWT in the variable (grnyte-dev and the
branch stack before its rotate rehearsal, prod steps 3 to 5) keeps its Bearer: Kong 2.8.1 on the
shared stack and the hosted gateway for legacy keys accept nothing else for admin and Storage. `supabaseAdmin()` passes it as `global.fetch`, and
so does `supabaseAuthServer`. Whether hosted GoTrue's admin API and Storage accept a secret key with
no Bearer is checked by a probe at runbook step 5 (a `getUserById` and a staging-bucket `list`); if
either refuses, step 5 is rolled back.

New file `src/lib/auth/server/authServer.server.ts`, beside `verify.server.ts` and `mail.server.ts`:

```ts
export type AuthServer = Pick<SupabaseClient['auth'], 'resend'>

export function supabaseAuthServer(event: Pick<RequestEvent, 'getClientAddress'>): AuthServer
```

- Built per call with `createClient(PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, ...)`; returns a frozen
  object holding `resend` bound to `client.auth`, and nothing else. `admin`, `mfa`, `from`, `rpc`,
  `storage`, `functions` and `schema` are not reachable, at runtime or in the type. A later change
  adds each method it needs to the `Pick` and the object, with that method's first caller and test.
- Headers: `apikey: <SUPABASE_SECRET_KEY>`, and `sb-forwarded-for: event.getClientAddress()` through
  `global.headers`. Nothing is read from `event.request.headers`. `secretKeyFetch` removes the
  `Authorization: Bearer <secret>` supabase-js adds.
- Auth options: `autoRefreshToken: false`, `detectSessionInUrl: false`, `flowType: 'implicit'`,
  `persistSession: false`. Nothing reaches a cookie, a code verifier included.
- No user-scoped option; `harden-auth-codes` adds one (proposal Impact names the near-expiry refresh
  trap it must avoid).
- Server only by its `.server.ts` suffix; its secret is a static private import, so a client import
  fails the build.
- `getClientAddress()` is the platform's view: Vercel's edge address under `adapter-auto`; under
  `adapter-node` behind a proxy it would need `ADDRESS_HEADER`; grnyte deploys on Vercel.
  Whether Vercel overwrites or appends a client-sent `X-Forwarded-For` is recorded by the deployed
  probe at step 5.

`src/lib/auth/server/mail.server.ts`'s `mailSignupConfirmation` takes an `AuthServer`, and its two callers
(`signup.remote.ts:96`, `forgot-password.remote.ts:31`) pass `supabaseAuthServer(getRequestEvent())`;
their tests mock `$lib/auth/server/authServer.server`. `resend({ type: 'signup' })` sends no PKCE challenge,
so the flow type does not change the mail. `mailPasswordReset` stays on `locals.supabase` (PKCE
today; `harden-auth-codes` moves it). `proofOfWork.server.ts` derives from the same
`SUPABASE_SECRET_KEY`; `harden-auth-codes` extracts that derivation as `labelledKey(label)`.

Alternatives: returning `client.auth` exposes `auth.admin` (user listing, sign-in link generation,
deletion) under the secret key; a denylist Proxy is easier to get wrong than an allowlist; a
module-level singleton is wrong because the header is per request.

### 5. zero-cache keeps one key option: the secret until rotation, then the JWKS

zero-cache keeps its door check. Removing it was the first plan and failed its proof (tasks.md 5.1,
2026-11-14, on the deployed image 1.11.0 with no key option): forged and absent tokens got no rows
and no write, but a second person with a VALID token who joined the first person's client group as a
new client, claiming the first person's user id, received 65 of the group's stored rows before
zero-cache compared the user id get-queries validated and closed the connection. The door check
binds `sub` to the connection's `userID` before any work, so it refuses that connection first.

zero-cache takes exactly one key option and the JWKS holds no symmetric key, so it can never accept
both kinds. Merge A keeps `ZERO_AUTH_SECRET`. At step 4, after "Rotate keys", deploy-zero's
`workflow_dispatch` on `keys/z-zero-jwks` swaps it for `ZERO_AUTH_JWKS_URL` (a public URL, the
project's JWKS) within 10 minutes. In the gap, every ES256 token that reaches zero-cache makes it
exit and restart (see Risks), so Zero sync is down for everyone until the swap lands; queued writes
stay on the devices. After the swap an unexpired HS256 token is refused at connect, lands in Zero's
`needs-auth`, which keeps queued writes, and recovers on the next refresh through
`(app)/+layout.svelte:113-130`. The swap commit reaches main with merge C at 4b; until then no
release from main may touch `deployment/**` or `src/lib/zero/**`, because deploy-zero would write the
secret back and its HS256-only check would refuse every ES256 session.

`deploy-zero.yml` gains a step that fails unless exactly one of `ZERO_AUTH_SECRET`,
`ZERO_AUTH_JWKS_URL`, `ZERO_AUTH_JWK` is in the written env file, because two set means no check at
all. The proof that the door check refuses the 5.1(d) connection is rerun on every Zero upgrade
(tasks.md 5.1b, `deployment/README.md`).

### 6. PowerSync holds both kinds, then only the JWKS

`service.yaml` keeps `supabase: true` and `supabase_jwt_secret` and adds `jwks_uri: !env PS_JWKS_URI`;
the collector merges them, so PowerSync accepts both kinds before rotation. Explicit rather than
auto-detected: the prod `PS_DATA_SOURCE_URI` is a vault value this plan cannot inspect, and the
branch stack's `db` hostname never auto-detects, so one explicit URI works in both. At step 4b,
merge C removes `supabase_jwt_secret` and `supabase: true` from `service.yaml` and
`PS_SUPABASE_JWT_SECRET` from the allowlist.

The shared-stack PowerSync cannot follow: that stack has no JWKS and stays HS256. A new
`deployment/powersync/service.local.yaml` (the same storage and sync settings, `client_auth` with the
secret only) is what `docker-compose.powersync.local.yml` mounts, until the shared stack is upgraded.

### 7. No nginx limits

Per-address limits in front of zero-cache were planned only because an unverified connection would
cost zero-cache work. The door check stays (decision 5), so it refuses such a connection before any
work, and `deployment/nginx.zero.conf` is unchanged.

### 8. A second local stack for the branch, and the rehearsal on it

A copy of the self-hosted `docker/` folder at tag `self-hosted/v0.8.3` (v0.8.4 is under two weeks
old) in `<second stack>/`, compose project `supabase-keys`:

- `.env` from `utils/generate-keys.sh --update-env` (without the flag a non-interactive shell writes
  nothing), checked to differ from `.env.example` in `JWT_SECRET`, `ANON_KEY` and every password.
- `docker-compose.override.yml`: every `container_name` prefixed `<prefix>-`, except realtime, which
  becomes `<realtime container>` because realtime reads its tenant id from the first label;
  every `ports` list replaced with `!override` and bound to `127.0.0.1`, offset by 10000 (gateway
  <api port>, Supavisor <pooler port>, the database itself on <db port>, S3 <s3 port>/<s3 port>, mail <mail port>/<mail port>/<mail port>;
  v0.8.3 publishes no HTTPS gateway, Studio or analytics port); Envoy's realtime upstream
  (`volumes/api/envoy/cds.yaml:82`) repointed at the renamed container and nothing else in Envoy
  touched; the shared stack's local edits ported from its `git diff` (the custom access token hook
  env, mail and minio services), with the release's own storage image rather than the overlay's
  older one.
- Data for the proof: two real users signed up through the app (confirmed through the mail
  catcher), each with a region holding a few areas, blocks and routes, so "no rows" in the proof is
  measured against client groups that hold rows; `ci/seed.sql`'s users cannot sign in to a real
  GoTrue and it seeds no regions.
- Rotate rehearsal: start with legacy keys only, sign in, then `utils/add-new-auth-keys.sh
--update-env` and recreate, which makes GoTrue sign ES256 with the legacy key still accepted; the
  earlier HS256 session must keep browsing and syncing.
- The worktree's database is the stack's Postgres on <db port> (migrated with env inline, never the
  shared DB); its zero-cache runs as compose project `<zero project>` with `!override` ports (<zero port> and
  CVR <cvr port>), with no key option for proof 5.1 and then one key option at a time for 5.1b (the
  stack's `JWT_SECRET`, then `ZERO_AUTH_JWKS_URL` on the gateway's JWKS), reaching the dev server as
  `localhost:<dev port>` through `host-gateway`;
  its `ZERO_CVR_DB` points at that compose project's `cvr` service, so the CVR is countable on <cvr port>.
- Its PowerSync is a standalone `<second stack>/powersync.compose.yml` modelled on
  `docker-compose.powersync.local.yml` (not layered over it): project `<powersync project>`, port
  `127.0.0.1:<powersync port>`, the external network `supabase-keys_default`, where the stack's compose service
  names resolve: `PS_DATA_SOURCE_URI` on `db:5432` with the stack's password and `PS_JWKS_URI` on
  `http://auth:9999/.well-known/jwks.json`; the stack's `JWT_SECRET` as `PS_SUPABASE_JWT_SECRET`;
  `POWERSYNC_CONFIG_PATH` on the repo's prod-shaped `service.yaml`. The branch database gets the
  same `create publication powersync` the shared one has.
- The pinned upstream copy stays at `<second stack>/.pinned/` as the baseline for diffs.
- Compose always runs with `--env-file` pointing at a file in `<second stack>/`, never the
  sandbox-denied repo `.env`.

CI is unchanged: the shim plus HS256 placeholders, enough because the verifier keeps both paths and
ES256 is unit-tested.

### 9. Upload and deployed checks

The staging XHR adds `apikey: PUBLIC_SUPABASE_PUBLISHABLE_KEY`. `check-prod.ts` reads the renamed
variable and adds three checks: `SUPABASE_JWT_JWKS_URL` starts with `https://`, the JWKS at
`/auth/v1/.well-known/jwks.json` holds an `ES256` or `RS256` key (fails otherwise), and the key
starts with `sb_publishable_`. The prefix check only warns
for a legacy JWT-shaped value, because between runbook steps 3 and 5 the new name holds the legacy
key and the daily post-deploy run would otherwise fail; after step 7 a legacy value fails the
existing `/auth/v1/settings` fetch anyway, so the warning never hides a live legacy key.

### Zero, mutators, remote functions

Nothing here is a Zero query or mutator. The only remote functions touched (`signup`,
`forgotPassword`) keep their names, paths and arguments. Schema: none.

## Risks / Trade-offs

- [Zero's key swap window at step 4] → for at most 10 minutes after "Rotate keys", every ES256
  token restarts zero-cache (next bullet), so Zero sync is down for everyone; after the swap an
  unexpired HS256 token waits in `needs-auth` with its queued writes and recovers on the next
  refresh. The dispatch is prepared and rehearsed (tasks.md 5.1b, 5.2b) so the window stays short.
- [Accepted: an ES256-header token crashes zero-cache while it holds the secret] → Zero 1.11.0 to
  1.12.0 and main close a refused connection with the error message as the WebSocket close reason
  (`packages/zero-cache/src/workers/syncer.ts:807` upstream, `out/zero-cache/src/workers/syncer.js:358`
  installed); jose's message for an asymmetric token against a secret
  is over the 123-byte limit, so the close throws and zero-cache exits and restarts (tasks.md 5.1b).
  Anyone can trigger it on prod until the step-4 swap, and in the window every ES256 client that
  reconnects restarts it, so sync is down for everyone until the swap. Accepted rather than patched,
  because Zero is being replaced: the window is kept to the dispatch time, and the JWKS option
  refuses every token shape tried without crashing.
- [A release from main between step 4 and merge C reaching main] → deploy-zero would write
  `ZERO_AUTH_SECRET` back and crash-loop zero-cache. No release from main touches `deployment/**`
  or `src/lib/zero/**` until merge C, which carries the swap commit, is on main. From 4b the vault no
  longer holds `ZERO_AUTH_SECRET` or `PS_SUPABASE_JWT_SECRET`, so a stale allowlist fails in
  deploy-zero's prepare step instead of redeploying either secret. A manual deploy (README recipe)
  in that time runs from a `keys/z-zero-jwks` or `keys/c-powersync` checkout, never from main.
- [A dispatched branch is older than main] → `workflow_dispatch` deploys the branch's whole
  `deployment/**` and `src/lib/zero/**`. Before each dispatch, `origin/main` is merged into the branch
  and pushed, and `git diff origin/main origin/<branch> -- deployment src/lib/zero .github/workflows` must
  show only the branch's own lines (the run clones the pushed branch).
- [A future Zero release changes the door check] → tasks.md 5.1b reruns on every Zero upgrade
  (`deployment/README.md`), including the 5.1(d) connection that leaked rows without it.
- [An open tab or installed PWA holds the anon key after the switch] → legacy keys stay enabled at
  least 7 days and until Supabase's API logs show no legacy-key request for 24 h. Re-enabling is one
  dashboard toggle.
- [The legacy secret is a minting key until removed] → removed from zero-cache by the swap at step 4,
  from grnyte's other verifiers (the app and prod PowerSync) at step 4b, one token lifetime after
  rotation, and from every Vercel target with it; at 4b grnyte-prod also loses `SUPABASE_JWT_SECRET`,
  `ZERO_AUTH_SECRET` and `PS_SUPABASE_JWT_SECRET`. Its check sends an HS256 token signed with the old secret and expects 401
  from the app and a refusal from PowerSync.
- [Supabase still accepts HS256 until step 8] → between 4b and 8, GoTrue and hosted Storage accept a
  token signed with the legacy secret, `service_role` included, so anyone holding the secret can
  still act against Supabase directly. Accepted for the 7+ day wait the anon-key retirement needs;
  the secret is no longer on Vercel or the VPS in that window.
- [Old deployments keep the secret] → builds from before merge B inline `SUPABASE_JWT_SECRET`, and
  merge-B builds made before 4b still read it at runtime; both stay reachable at their own
  `*.vercel.app` URLs against the prod database. Step 4b deletes every production and preview
  deployment made before it, unconditionally (none is a valid rollback anyway), and removes any
  branch-specific preview value of the variable.
- [A device asleep across 4b] → its expired HS256 token is `invalid` rather than `expired` (jose
  refuses the algorithm before reading `exp`); it recovers through the client's `needs-auth` retry,
  which refreshes onto ES256, and the hook's `getSession()` refreshes it before verifying on page
  loads. Task 7.5 probes it.
- [Secret key value is the service-role JWT between steps 3 and 5] → it keeps its Bearer (the legacy
  gateway needs it) and GoTrue ignores `Sb-Forwarded-For` until step 5; the follow-up auth changes
  do not reach develop before step 5.
- [Other develop work rides along a release] → each merge ships as a normal develop to main release;
  the pre-release `git diff --stat main..develop` check over the auth, Zero and deployment paths is
  the guard, and a step waits while develop holds something risky.
- [Revoked key cached] → jose keeps a fetched JWKS up to 10 minutes and Supabase's edge 10 more, so a
  revoked asymmetric key verifies in the app up to 20 minutes. Accepted.
- [The proof-of-work switch] → `proofOfWork.server.ts` derives the altcha HMAC keys from
  `SUPABASE_SECRET_KEY`. Changing its value from the legacy service-role JWT to `sb_secret_*`, and
  every later secret-key rotation, invalidates in-flight challenges (10 minutes) and any derived
  values of later changes for their short lifetimes. A sign-up or reset mid-solve fails once and is retried.
- [Secret key in the client bundle] → the static private import already fails a client build; the
  build grep with a sentinel value proves it on the output, not the source.
- [JWKS fetch adds latency on a cold instance] → one small GET per cold start, cached after.
- [No hosted rehearsal] → the dashboard clicks are first exercised on prod, and hosted Supabase may
  rotate differently from the self-hosted release; each step is reversible, and the local rehearsal
  covers every non-dashboard step and the Rotate behaviour.
- [The second local stack drifts from the shared one] → removed once the last of the follow-up auth
  changes has merged (they are applied and rehearsed on it), when the shared stack is upgraded from
  the main checkout.

## Migration Plan

Three merges and the steps between them. Each line: action / proof / rollback (with the window in
which that rollback is valid). This plan is the runbook: the repo docs (`deployment/SECRETS.md`, `deployment/README.md`) keep only
what stays true after the migration, so no step-by-step procedure enters the git history. The app and
PowerSync accept both kinds from merges A and B until step 4b; zero-cache accepts one kind at a time,
so step 4 has the one coordination window, Zero's key swap (decision 5).

How code ships: the code is written and rehearsed in this worktree, then split into
`keys/a-deployment` and `keys/b-app`, each cut from develop, plus `keys/c-powersync` and
`keys/z-zero-jwks` ("the switch": Zero's key swap), each cut from the tip of `keys/a-deployment`
because they edit its files; the switch holds only the swap of `ZERO_AUTH_SECRET` for
`ZERO_AUTH_JWKS_URL` (the allowlist and the README recipe's `KEEP=`). A and B share `.env.example` and `src/lib/hooks/auth.server.ts`, so B merges
develop (after A) before its own release. Each of the first three is merged into develop only right before its own
develop to main release, and only after `git diff --stat main..develop -- src/lib/auth src/lib/hooks
src/lib/zero src/lib/db/supabaseAdmin.server.ts deployment .github/workflows eslint.config.js
svelte.config.js` lists only that merge's files; a step waits while develop holds something risky. A
ships only after proof 5.1b passed. `keys/z-zero-jwks` ships at step 4 through deploy-zero's
`workflow_dispatch`, which deploys `github.ref_name`, and is merged into `keys/c-powersync` before C
ships. C ships at 4b, through `workflow_dispatch` too if develop is not clear then, and is merged
into main at the next release; until C is on main, no release from main touches `deployment/**` or
`src/lib/zero/**` (decision 5). Before every dispatch, merge `origin/main` into the branch, push it,
and check `git diff origin/main origin/<branch> -- deployment src/lib/zero .github/workflows` shows
only its own lines. Merge A
touches `deployment/**`, so deploy-zero redeploys the VPS; merge B touches `src/lib/zero/**` and
`deployment/check-prod.ts`, so deploy-zero reruns with unchanged VPS config, and Vercel deploys the
app; merge C touches `deployment/**` and `deploy-zero.yml`. `harden-auth-codes`, `add-social-sign-in` and
`add-native-auth-handoff` stay on `feature/social-logins` until step 5 is done. Before merge B enters
develop, both Vercel targets (production and preview) carry the new names, and peer sessions are
told to re-run `npm run secrets:pull` once it lands.

0. Rehearse on the branch stack (decision 8), PowerSync and zero-cache included.
1. Dashboard: JWT Keys > "Migrate JWT secret". / The JWKS URL lists one ES256 key. / Delete the
   standby key (nothing signed with it); valid until 4.
2. Add `PS_JWKS_URI` and `ZERO_AUTH_JWKS_URL` to grnyte-prod (before tasks 5.2 and 5.2b write their
   uuids); release merge A (deploy-zero allowlist keeping `ZERO_AUTH_SECRET`, adding `PS_JWKS_URI`
   and the exactly-one guard; PowerSync with both sources), only after tasks.md 5.1b passed. Safe
   before the app because zero-cache keeps today's check and PowerSync keeps the secret. / Sync works
   on an HS256 session; the container env holds exactly one `ZERO_AUTH_*`, the secret; PowerSync
   accepts an HS256 session. / Revert merge A; valid until 4.
3. Bitwarden: add `PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY` holding the LEGACY
   values, and `SUPABASE_JWT_JWKS_URL`, to grnyte-prod, and the two names to grnyte-dev (tasks.md 7.0b,
   before task 6.4 writes their uuids); push to both Vercel targets; release merge B. / The app
   works unchanged; `check-prod` passes the JWKS check and warns on the prefix. / Until 4: redeploy
   the previous build. From 4 on: rebuild and redeploy a merge-B commit (a pre-B build's JWKS path is
   unproven and signs people out on a JWKS fetch failure), never promote a deployment or use Vercel
   Instant Rollback (every earlier deployment held the secret and is deleted at 4b).
4. Dashboard: "Rotate keys"; within 10 minutes, run deploy-zero's `workflow_dispatch` on
   `keys/z-zero-jwks` (the env holds `ZERO_AUTH_JWKS_URL` and no secret). / A fresh sign-in yields an
   ES256 token that the app, Zero and PowerSync accept; an HS256 session from before keeps working in
   the app and PowerSync and resumes Zero sync after its next refresh; the container env holds
   exactly one `ZERO_AUTH_*`, the JWKS URL. / Unverified: the dashboard documents no direct rotate back
   to a previously used key; the documented path is to move the legacy key to standby and rotate, 5
   minutes apart. Keep zero-cache on the JWKS until one token lifetime plus 15 minutes later, then
   dispatch deploy-zero on main to put the secret back. A device that still sends an ES256 token,
   expired or not (jose refuses the key type before reading `exp`), restarts zero-cache each time it
   reconnects until it refreshes onto HS256; the wait makes those few, it cannot make them none.
   Zero sync is down for that hour (the JWKS refuses the new HS256 tokens). Valid only before 4b, or after 4b has been rolled back (the secret back in the app and
   PowerSync), or every HS256 session issued after the rollback is refused and everyone is signed out.
   4b. One token lifetime plus 15 minutes after 4: delete `SUPABASE_JWT_SECRET`, `ZERO_AUTH_SECRET`
   and `PS_SUPABASE_JWT_SECRET` from grnyte-prod (so no later push or deploy can bring them back), and
   `SUPABASE_JWT_SECRET` from Vercel's production and preview
   targets and from any branch-specific preview value; redeploy; delete every production and preview
   deployment made before 4b; release merge C (PowerSync without the secret, and the Zero swap from
   `keys/z-zero-jwks`); the release freeze of decision 5 ends once C is on main. / An HS256 token signed with
   the legacy secret gets 401 from the app and is refused by PowerSync and zero-cache; ES256
   sessions sync. / Restore the three secrets from the vault's history (a restore keeps the uuid, checked
   2026-11-14; a secret ever restored with a new
   uuid needs that uuid in the workflow and `secrets.mjs verify` before any deploy), push and redeploy the app; revert only
   C's PowerSync commit (`service.yaml` and the `PS_SUPABASE_JWT_SECRET` allowlist line), never the
   Zero swap: on main through a release if C is there, otherwise on `keys/c-powersync`, dispatched with
   the pre-dispatch merge, push and `origin/` diff; valid until 8.
5. Dashboard: create the publishable and secret keys; switch the two Bitwarden values to them; push;
   redeploy (`$env/static` inlines them). Enable `security_sb_forwarded_for_enabled`; run the
   negative, positive and deployed forwarding probes and the admin and Storage no-Bearer probe. /
   Browser requests carry `sb_publishable_`; a sign-up confirmation resend works; the probes pass; an
   HS256 token signed with the legacy secret still gets 401 from the live app. / Put the legacy
   values back, push, redeploy; switch the setting off; valid until 7. Only after this step may the
   auth changes merge into develop.
6. Wait at least 7 days. / No legacy-key requests in the logs for 24 h.
7. Dashboard: disable the legacy API keys. / `check-prod` passes; the old anon key gets 401. /
   Re-enable them; valid until 8 (the keys are JWTs signed by the legacy secret).
8. At least one token lifetime plus 15 minutes after 4: revoke the legacy secret. / GoTrue refuses an
   HS256 token signed with it. / "Move to standby" from revoked, and no rotate: from 4b nothing of
   grnyte's accepts HS256, so a rotate back would sign tokens every verifier refuses.
9. Remove `PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` from grnyte-prod and Vercel
   (`SUPABASE_JWT_SECRET`, `ZERO_AUTH_SECRET` and `PS_SUPABASE_JWT_SECRET` left at 4b). / The names are
   absent from `node deployment/secrets.mjs ids`. / Restore from the vault's history.

## Open Questions

- Whether hosted Storage needs `apikey` on a user-token request after the legacy keys are disabled.
  Task 4.1 sends it regardless, so the answer changes nothing built.
