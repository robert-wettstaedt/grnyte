# Zero Infrastructure Deployment

## Architecture

- **Single VPS deployment** with nginx in front of the Zero instance
- **Production instance**: `zero.grnyte.rocks`
- **SSL/TLS**: Automatic SSL certificates via Let's Encrypt
- **Migration-friendly**: Can easily be split to separate servers in the future

## Files

- `docker-compose.zero.yml` - Docker Compose configuration for the Zero instance and its CVR database
- `nginx.zero.conf` - Domain-based nginx configuration with SSL support
- `.env.prod` - Instance environment variables (written during deployment)
- `.env.health` - `PS_ADMIN_TOKEN` alone, for `sync-health-prod` (written during deployment)
- `powersync/service.yaml` - PowerSync config for the VPS; `powersync/service.local.yaml` is the same
  without `jwks_uri`, for the shared local stack, which has no JWKS

## Deployment

### Automatic (GitHub Actions)

The deployment is handled automatically by the `deploy-zero.yml` GitHub Actions workflow when changes are pushed to the main branch. The workflow:

1. Writes `.env.prod` from the Bitwarden project
2. Deploys the Zero instance using `docker-compose.zero.yml`
3. Sets up nginx
4. Performs a health check on the instance

### Manual Deployment

If you need to deploy manually:

```bash
# SSH into your VPS
ssh user@your-vps

# Navigate to deployment directory
cd ~/zero-deployment/deployment

# Write the environment file from Bitwarden. Run this from a checkout on
# your machine, not on the VPS: no access token belongs on that box.
BWS_ACCESS_TOKEN=<prod token> node deployment/secrets.mjs pull env.all
# zero-cache takes exactly one ZERO_AUTH_* option, as deploy-zero.yml checks: KEEP names it.
KEEP=ZERO_AUTH_JWKS_URL
grep -E '^(ZERO|PS)_' env.all | grep -v '^ZERO_AUTH_' > env.zero
grep "^$KEEP=" env.all >> env.zero
[ "$(grep -c '^ZERO_AUTH_' env.zero)" = 1 ] || { echo "env.all holds no $KEEP"; exit 1; }
ssh user@your-vps 'cat > ~/zero-deployment/deployment/.env.prod' < env.zero
grep '^PS_ADMIN_TOKEN=' env.all | ssh user@your-vps 'cat > ~/zero-deployment/deployment/.env.health'
rm env.all env.zero

# Clean up any existing deployment
docker compose -f docker-compose.zero.yml down -v --remove-orphans
docker network prune -f

# Deploy
docker compose -f docker-compose.zero.yml up -d

# Check status
docker compose -f docker-compose.zero.yml ps
docker compose -f docker-compose.zero.yml logs
```

## Environment Variables

Each instance reads `.env.<instance>`, which holds the `ZERO_*` half of that environment's Bitwarden
project and nothing else. The app's own secrets stay off this box.

- `ZERO_UPSTREAM_DB` - Database connection string
- `ZERO_AUTH_SECRET` or `ZERO_AUTH_JWKS_URL` - zero-cache's token check: exactly one of them
  (with none it serves a client group's stored rows before checking who asks, with two it checks
  nothing). Rerun that check on a local stack on every Zero upgrade
- `ZERO_ADMIN_PASSWORD` - Zero admin password
- `ZERO_GET_QUERIES_URL` - The app's get-queries endpoint for this environment
- `ZERO_MUTATE_URL` - The app's mutate endpoint for this environment (`/api/zero/mutate`)
- `ZERO_CVR_DB` - Client view records, pointing at the `cvr-prod` container on this box (prod only)

### `ZERO_CVR_DB` is deliberately not backed up

`backup-db.yml` covers the upstream database. It does NOT cover the `cvr_data_*` volumes, and that is
on purpose rather than an oversight: **do not add them.**

Client view records are derived state. They track which rows each client has already been sent, so
losing them costs every client one re-sync and nothing else, which is the same path a client already
takes after a long absence when zero-cache collects an inactive record
(`ZERO_CVR_GARBAGE_COLLECTION_INACTIVITY_THRESHOLD_HOURS`, 720 in prod). Backing them up would ship a
recreatable, fast-growing table around nightly for no recovery benefit.

They live here rather than in the upstream database to keep them off Supabase, which is on a capped
plan. Measured in the upstream database before the move: the `zero_0/cvr` schema was 184 MB of a
298 MB database, 62% of the whole thing, against real application data of 114 MB, with 3.2M row
writes across its tables.

Latency was the ORIGINAL reason and it was wrong, so do not reinstate it: unset, `ZERO_CVR_DB`
defaults to `upstream-db`, which put the records in Frankfurt while this box is in Nuremberg, and
moving them was predicted to cut query registration time. It did not. `listBlocks({})` server time
went 2078.8 ms before to 2174.8 ms after (medians of six and three samples), and every other stable
query was flat. Cross-region bookkeeping was not a measurable part of this app's sync latency.

Rolling back is still reverting this one variable, but the upstream `zero_0/cvr` schema was dropped
on 2026-09-30 to reclaim the space, so there are no old records to fall back to: zero-cache
bootstraps the schema again on boot and every client re-syncs once.

The container takes no password. It sits alone on `cvr_network`, which is `internal: true` and which
nginx is not on, so the only thing that can route to it is the zero-cache that would hold its
credentials anyway. A password would need a second secret, and the deploy's env writer passes only
`ZERO_*` keys to the box, so that one would be fetched from the vault and silently dropped.

The rest (`ZERO_REPLICA_FILE`, `ZERO_SCHEMA_PATH`, the connection caps) are paths and tuning, and
live in `docker-compose.zero.yml` where you can read them. See [SECRETS.md](SECRETS.md) for how the
values get here.

## Monitoring

Check deployment status:

```bash
# View running containers
docker compose -f docker-compose.zero.yml ps

# View logs
docker compose -f docker-compose.zero.yml logs zero-prod
docker compose -f docker-compose.zero.yml logs nginx

# Test connectivity
curl -f https://zero.grnyte.rocks
curl -f https://sync.grnyte.rocks/probes/liveness

# PowerSync diagnostics (replication lag, errors). nginx refuses /api/admin/ from outside, so ask from inside.
docker exec powersync-prod node -e "fetch('http://localhost:8080/api/admin/v1/diagnostics', { method: 'POST', headers: { authorization: 'Bearer ' + process.env.PS_ADMIN_TOKEN, 'content-type': 'application/json' }, body: '{}' }).then((r) => r.text()).then(console.log)"
```

### Sync health

`sync-health-prod` runs `powersync/health.mjs`, which asks the diagnostics API with `PS_ADMIN_TOKEN`
(from `.env.health`, nothing else) at most once per `CACHE_MS` (15 s), concurrent requests sharing
one call, and serves the verdict at `https://sync.grnyte.rocks/health/sync`: 200 when healthy, 503
when any error list holds a fatal error (warnings pass), replication lag passes `MAX_LAG_BYTES`,
`wal_status` is `unreserved` or `lost`, `safe_wal_size` is under `MIN_SAFE_WAL_BYTES` (128 MiB, a quarter of prod's 512 MB cap), the
last checkpoint is missing or older than `MAX_CHECKPOINT_AGE_MS`, diagnostics refuses the token
(reason `unauthorized`), or it does not answer within 5 s (reason `unreachable`). The body is
`status`, `reasons`, `lagBytes`, `safeWalSize`, `walStatus`, `lastCheckpoint`, `errorCount` and the service `version`, never
the token, URIs or table names. Upptime polls it once `sync.grnyte.rocks` has DNS and a certificate,
and app admins read it in Settings > Sync health.

```bash
curl -s -w ' %{http_code}\n' https://sync.grnyte.rocks/health/sync
```

Locally, against the local service (its token is `local-admin`), then set
`SYNC_HEALTH_URL=http://localhost:58101/health/sync` in `.env.local` (Vite loads it after `.env`, and
`npm run secrets:pull` never rewrites it; restart the dev server) for the Settings screen:

```bash
POWERSYNC_URL=http://localhost:58100 PS_ADMIN_TOKEN=local-admin PORT=58101 node deployment/powersync/health.mjs
curl -s -w ' %{http_code}\n' http://localhost:58101/health/sync
```

`powersync-compact-prod` compacts bucket storage hourly; its log is the place to look when MongoDB
grows.

## Troubleshooting

### Common Issues

1. **Environment variables not loaded**: Ensure `.env.prod` exists and contains the `ZERO_*` variables
2. **Network conflicts**: Clean up with `docker network prune -f`
3. **SSL certificate issues**: Check certbot logs with `docker compose logs certbot`
4. **Zero server health checks failing**: Check individual container logs

### Reset Deployment

```bash
# Complete reset (WARNING: This will delete all data)
docker compose -f docker-compose.zero.yml down -v --remove-orphans
docker volume rm deployment_zero_data_prod deployment_certbot_conf deployment_certbot_www
docker network prune -f
```

## Database backups

The prod database is dumped nightly to this VPS by `.github/workflows/backup-db.yml`, thirty days
deep under `~/backups/grnyte`. Restoring one is [RESTORE.md](RESTORE.md).

## Auth (GoTrue) settings

Sign-up, codes and account changes depend on GoTrue switches as much as on code. `npm run check:prod`
asserts every row below but the templates (`deployment/authConfig.ts`), reading the Management API
with `SUPABASE_PROJECT_REF` and a read-only `SUPABASE_ACCESS_TOKEN`; without them it fails.

GoTrue version: `v2.197.0`, the newest release at least two weeks old that is `>= v2.175.0` and has
the password-changed and email-changed notification switches (on 2026-11-15 only `v2.198.0-rc.*`
was newer). Hosted projects run Supabase's own version; this pin is for self-hosted stacks.

| Setting                          | Hosted (dashboard or Management API)                                                              | Self-hosted env                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Before-user-created hook         | `hook_before_user_created_enabled`, URI `pg-functions://postgres/public/before_user_created_hook` | `GOTRUE_HOOK_BEFORE_USER_CREATED_ENABLED=true`, `_URI` as hosted             |
| Email code length                | `mailer_otp_length` = 8                                                                           | `GOTRUE_MAILER_OTP_LENGTH=8`                                                 |
| Email code lifetime              | `mailer_otp_exp` = 600                                                                            | `GOTRUE_MAILER_OTP_EXP=600`                                                  |
| Secure email change (both codes) | `mailer_secure_email_change_enabled` = true                                                       | `GOTRUE_MAILER_SECURE_EMAIL_CHANGE_ENABLED=true`                             |
| Secure password change           | `security_update_password_require_reauthentication` = true                                        | `GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_REAUTHENTICATION=true`              |
| Password changed notice          | `mailer_notifications_password_changed_enabled` = true                                            | `GOTRUE_MAILER_NOTIFICATIONS_PASSWORD_CHANGED_ENABLED=true`                  |
| Email changed notice             | `mailer_notifications_email_changed_enabled` = true                                               | `GOTRUE_MAILER_NOTIFICATIONS_EMAIL_CHANGED_ENABLED=true`                     |
| Refresh token rotation           | `refresh_token_rotation_enabled` = true, `security_refresh_token_reuse_interval` = 10             | `GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED=true`, `_REUSE_INTERVAL=10`  |
| Access token lifetime            | `jwt_exp` = 3600                                                                                  | `GOTRUE_JWT_EXP=3600`                                                        |
| Email rate limit                 | `rate_limit_email_sent` at least 30 an hour (custom SMTP)                                         | `GOTRUE_RATE_LIMIT_EMAIL_SENT=30`                                            |
| Email provider                   | `external_email_enabled` = true                                                                   | `GOTRUE_EXTERNAL_EMAIL_ENABLED=true`                                         |
| Confirmation required            | `mailer_autoconfirm` = false                                                                      | `GOTRUE_MAILER_AUTOCONFIRM=false`                                            |
| Phone and anonymous sign-up      | `external_phone_enabled` = false, `external_anonymous_users_enabled` = false                      | `GOTRUE_EXTERNAL_PHONE_ENABLED=false`, `_ANONYMOUS_USERS_ENABLED=false`      |
| Public sign-up                   | `disable_signup` = false, set LAST, once the hook is confirmed active                             | `GOTRUE_DISABLE_SIGNUP=false`                                                |
| Apple provider (ID tokens)       | `external_apple_enabled` = true, `external_apple_client_id` = `<APPLE_SERVICES_ID>` first         | `GOTRUE_EXTERNAL_APPLE_ENABLED=true`, `_CLIENT_ID` as hosted                 |
| Google provider (ID tokens)      | `external_google_enabled` = true, `external_google_client_id` = the web client ID first           | `GOTRUE_EXTERNAL_GOOGLE_ENABLED=true`, `_CLIENT_ID` as hosted                |
| Nonce check                      | `external_apple_skip_nonce_check` = false, `external_google_skip_nonce_check` = false             | `GOTRUE_EXTERNAL_APPLE_SKIP_NONCE_CHECK=false`, `_GOOGLE_` the same          |
| Manual linking (unlink)          | `security_manual_linking_enabled` = true                                                          | `GOTRUE_SECURITY_MANUAL_LINKING_ENABLED=true`                                |
| Identity linked/unlinked notices | `mailer_notifications_identity_linked_enabled`, `_unlinked_enabled` = true                        | `GOTRUE_MAILER_NOTIFICATIONS_IDENTITY_LINKED_ENABLED=true`, `_UNLINKED_` too |
| Mail templates and subjects      | `push-templates.ts` after `PUBLIC_ORIGIN=https://grnyte.rocks npm run generate`                   | `GOTRUE_MAILER_TEMPLATES_*` URLs and `GOTRUE_MAILER_SUBJECTS_*`              |

grnyte runs the provider code flow itself and hands GoTrue only the ID token, so GoTrue reads no
provider secret or redirect URI; the second local stack sets placeholders for both
(`GOTRUE_EXTERNAL_<PROVIDER>_SECRET`, `_REDIRECT_URI`) and local client IDs. `GET /auth/v1/settings`
then lists `apple` and `google` as `true`. The Apple private relay settings belong to
`add-social-sign-in`. The hook refuses every email
sign-up without grnyte's `SIGNUP_MARKER`, so opening `disable_signup` before the hook is active
would let the publishable key create accounts past the bot checks. The hook does not run for admin
creates (GoTrue `v2.197.0`), so the marker on `admin.createUser` is bookkeeping, not a guard.

GoTrue fetches self-hosted templates as URLs. The branch's second local stack
(`<second stack>/`) serves `emails/gotrue/` from an `nginx:alpine` container named
`grnyte-mail-templates`; re-copy `subjects.json` into its override after the templates change.

GoTrue's per-IP limits count each person only because grnyte forwards `getClientAddress()` as
`sb-forwarded-for`. On Vercel that is the real client. Any other host runs `adapter-node` behind a
proxy and must set `ADDRESS_HEADER` (and `XFF_DEPTH` for `X-Forwarded-For`) to the header that proxy
sets, or every person shares the proxy's address in GoTrue's limits.

### New GoTrue version

grnyte relies on GoTrue behaviours that no release promises (an admin password update mails nothing
and ends every session, the email change order, the send-wait message, and more). They are pinned
in `src/lib/auth/gotrue.contract.server.test.ts`, each test naming the grnyte code that depends on
it, and were last measured on `GOTRUE_CONTRACT_VERSION` in `deployment/authConfig.ts`. Hosted
Supabase upgrades GoTrue without notice, so `npm run check:prod` reads `/auth/v1/health` and fails
naming both versions when the hosted one differs from the pin. When it does:

1. Point the second local stack (`<second stack>/`) at the hosted version: set
   the `supabase/gotrue:<version>` image of its `auth` service and recreate that container. Never
   the shared stack.
2. With the worktree's `.env` on that stack, run `npm run test:gotrue`. A test that skips means
   GoTrue was not reachable, not that it passed.
3. For each failure, fix the grnyte code its comment names (and the design note behind it), then
   change the test to the new behaviour.
4. Bump `GOTRUE_CONTRACT_VERSION`, and the version line above, in the same commit.

Until then the hosted project runs code tested against the old release: treat the failures as
live bugs.

### Sign in with Apple and Google

grnyte runs each provider's code flow on its own server (`src/lib/auth/oauth/`) and reads six
variables from `$env/dynamic/private`: `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`,
`APPLE_SERVICES_ID`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (`deployment/SECRETS.md`), plus
`PUBLIC_ORIGIN`, which builds the one return URL per provider. A provider with any variable empty,
or a request on another origin, is not offered. Web and the later app share the return URL:

- `https://<PUBLIC_ORIGIN>/auth/callback/apple` (Apple posts it, `response_mode=form_post`)
- `https://<PUBLIC_ORIGIN>/auth/callback/google`

**Apple.** Enroll in the Apple Developer Program as an Individual. Under Certificates, IDs &
Profiles: an App ID with Sign in with Apple enabled (primary); a Services ID, whose identifier is
`APPLE_SERVICES_ID`, with Sign in with Apple configured on that App ID, the origin's domain and the
return URL above (add the ngrok domain and its return URL for local tests); a key with Sign in with
Apple enabled, whose ID is `APPLE_KEY_ID` and whose downloaded `.p8` contents are
`APPLE_PRIVATE_KEY` (Apple shows it once). `APPLE_TEAM_ID` is the membership's Team ID. The app
mints a 5-minute client secret per exchange; GoTrue needs no Apple secret (if the hosted dashboard
demands one to enable the provider, mint a 6-month one once and let it lapse).

**Apple private relay.** Under Sign in with Apple for Email Communication, register the From
domain of `RESEND_SENDER_EMAIL` and Resend's Return-Path subdomain (the `send.` domain in Resend's
DNS records), each passing SPF; until then mail to `@privaterelay.appleid.com` addresses bounces.

**Google.** In a Google Cloud project: the OAuth consent screen (External, app name grnyte, support
address, logo, the origin as authorized domain, links to `/legal/privacy` and `/legal/terms`,
scopes `openid` and `email`), then request brand verification so the consent screen shows the name
and logo. An OAuth client of type Web application with the Google return URL above as authorized
redirect URI (and the ngrok one for local tests): its ID is `GOOGLE_CLIENT_ID`, its secret
`GOOGLE_CLIENT_SECRET`.

**GoTrue.** The provider rows of the table above: both enabled for ID tokens, the web client first
in each client ID list (the app's bundle IDs follow it), nonce check on, manual linking and the
identity notices on. `npm run check:prod` asserts these and that the deployed `/auth/signin` offers
both buttons.

**ngrok for local Apple.** Apple accepts only https return URLs on a registered domain, and Kit
checks the `form_post`'s origin only in a built server. Reserve an ngrok static domain
(`<name>.ngrok-free.app`, allowed in `vite.config.ts`), register its return URLs as above, then:

```bash
PUBLIC_ORIGIN=https://<name>.ngrok-free.app npm run build   # static, so it moves the build's mail links too
npx vite preview --port 4173
ngrok http --url=<name>.ngrok-free.app 4173
```

Never test the Apple return under `npm run dev`, where Kit checks no origin.

### Migrating hosted databases only at release

Hosted projects are migrated with `npm run migrate` from the merged branch at release, never from a
feature branch. Drizzle applies only migrations newer than the last one a database recorded, so a
database migrated early from a branch would silently skip another branch's migration that was
generated earlier but merged later. Migrations are regenerated last on a branch, just before it
merges, so their numbers follow whatever merged first. The release order for the auth changes:
migrate, deploy the app, push the code templates, enable the hook and the switches above, then
`disable_signup=false` last and `npm run check:prod`.

### Upgrading the shared local stack

After the release, from the main checkout only, as its own announced step: bump
`<shared stack>/docker-compose.yml` to the GoTrue pin and env above, then migrate the
shared dev database. Never from a worktree: pointing the shared stack at a hook that exists only in a
worktree's database, or bumping its version, breaks every other session.

### Support runbooks

**Dead old mailbox.** A secure email change needs a code from the old address, which no longer
receives mail.

1. Verify ownership out of band: the person signs in on a known device, or answers what only the
   owner can (their regions, recent ascents).
2. Change the address by hand with the admin API:
   `updateUserById(id, { email: '<new address>', email_confirm: true })`.
3. The person uses forgot password at the new address.

**Lost provider account.** The person can no longer use the Apple or Google account they sign in
with.

1. Verify ownership the same way.
2. Change the address by hand to one they control, as above.
3. The person uses forgot password at that address to add a password.
