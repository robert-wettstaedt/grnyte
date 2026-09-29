# Design

## Context

See proposal.md for the attack. What decides the approach:

- `signUp` and `forgotPassword` are remote `form`s that call GoTrue from the server
  (`supabase.auth.signUp`, `resetPasswordForEmail`). GoTrue therefore sees Vercel's IP, not the bot's,
  so its per-IP limits never fire.
- `PUBLIC_SUPABASE_URL` and the anon key ship in the client bundle, so GoTrue's public endpoints are
  reachable without our forms.
- GoTrue's built-in captcha supports only Turnstile and hCaptcha, both third-party processors, which
  the privacy notice rules out.
- Region invites are grnyte tokens, not GoTrue invites, and an invitee without an account goes through
  the normal sign-up form. Nothing else creates accounts.
- The confirmation email is a generated GoTrue template (`src/lib/email/templates.ts`, `confirmation`)
  linking to `/auth/confirm` with `token_hash`.

## Goals / Non-Goals

**Goals:**

- Every email the app can be made to send to an unproven address costs the sender a proof-of-work
  solve, and there is exactly one such email per sign-up.
- No route around the checks through GoTrue's public API.
- No new service, host, processor or paid tier.

**Non-Goals:**

- Defeating a determined, targeted attacker (see proposal Non-goals).
- Changing sign-in, email change, or the invite flow.

## Decisions

### ALTCHA, verified in our remote functions

`altcha-lib` issues an HMAC-signed challenge (`createChallenge` with `expires` 10 minutes) and verifies
a solution (`verifySolution`) with no network call. The widget (`altcha`, a web component) solves it in
a Web Worker while the person types and writes the payload into a form field.

- Challenge endpoint: a new `GET` `+server.ts` under `(landing)/auth/` returning a fresh challenge,
  `Cache-Control: no-store`. The HMAC key is derived, `HMAC-SHA256(SUPABASE_SERVICE_ROLE_KEY,
  'altcha-challenge')`, rather than a new secret: domain-separated, as secret as its parent, and no
  Bitwarden step or deploy ordering. Rotating the service role key only voids challenges younger
  than 10 minutes.
- Verification: one shared server helper, `requireProofOfWork(payload)`, next to the auth form schemas
  in `$lib/forms/`, called first in both handlers. Nothing about GoTrue runs before it.
- Widget: one `ProofOfWork.svelte` in `$lib/forms/` beside `AuthField` and `FormError`, rendered in
  both forms with `display="invisible"` and `auto="onload"`, posting the payload as the `altcha` field.
  Its human-interaction-signature collector is switched off (pointer and typing telemetry). The widget
  script is bundled from npm, never loaded from a CDN.
- Difficulty: `maxNumber` tuned so a mid-range phone solves in about 1 second. Measured, not guessed.

Alternatives: Cap (needs a challenge store, standalone needs Docker plus Valkey), FCaptcha (behaviour
profiling, its own server), Turnstile and hCaptcha (third-party processors; hCaptcha free shows a
puzzle on every submit), GoTrue's before-user-created hook with a signed stamp (a secret in user
metadata ends up in every JWT; still leaves the email path in GoTrue's hands with no captcha).

### Single use through a spent-challenge table

ALTCHA is stateless, so a solved payload is replayable until it expires, which would let one solve
cover many victims. A new table `spent_challenges (signature text primary key, expires_at timestamptz)`
takes one `INSERT ... ON CONFLICT DO NOTHING` per accepted submission; zero rows inserted means a
replay. No personal data, server-only (written through `db`, RLS enabled with no policies). It lands in
the generated Zero schema like `client_error_logs`, since drizzle-zero has no exclusion list, but no
client query reads it. `/api/tasks/cleanup` gains a `sweepSpentChallenges`
beside `sweepErrorLogs`, deleting rows past `expires_at`.

Schema change: new table only, no backfill. Runs the pipeline (`schema.ts`, `generate:drizzle`,
`generate:zero`, `migrate`).

### Honeypot

A text input named like a real field (not `type=hidden`, which bots skip), placed off-screen with a
CSS class, `autocomplete="off"`, `tabindex="-1"`, `aria-hidden="true"`, no label a screen reader
announces. A filled value makes the handler return the same success shape it returns for a real
submission, without touching GoTrue. Added to both form schemas as an optional string.

### Reset only for confirmed accounts

`forgotPassword` reads `authUsers.emailConfirmedAt` (`drizzle-orm/supabase`) for the address through
`pinnedTx` and calls `resetPasswordForEmail` only when it is set. Every branch returns
`{ email, success: true }`. Email comparison is case-insensitive, matching GoTrue's lowercasing.

### Accounts created through the admin API, GoTrue still sends the email

`signUp` stops calling the public `auth.signUp`. It calls the service-role client's
`auth.admin.createUser({ email, password, email_confirm: false })`, writes the `users` and
`user_settings` rows exactly as today, then triggers the confirmation email with
`auth.resend({ type: 'signup', email, options: { emailRedirectTo } })`. GoTrue keeps rendering the
existing `confirmation` template, so the email is byte-for-byte unchanged. Public sign-up is then
switched off in GoTrue (`disable_signup: true`), which admin endpoints ignore.

The service-role client is currently constructed inline in `api/tasks/cleanup/+server.ts`. It moves to
one `$lib/db/supabaseAdmin.server.ts` export that both use.

Two facts this rests on were checked against GoTrue's source (v2.167.0 and master) before building: `admin.createUser` works
with `disable_signup` on, and `resend` of type `signup` still sends with it on. **Fallback** if resend
refuses: `admin.generateLink({ type: 'signup' })` returns `properties.hashed_token`; the server renders
the same `confirmation` template (substituting the token into the `/auth/confirm` URL) and sends it
through the existing `sendEmail` in `$lib/email/send.server.ts`.

Error mapping: an address that already has an account must answer the way `auth.signUp` did (GoTrue's
obfuscated "user already registered" behaviour), not reveal the account through a distinct admin-API
error. The handler maps the admin error to the same outcome the public call produced.

### Unconfirmed accounts expire after 7 days

`/api/tasks/cleanup` gains `sweepUnconfirmedAccounts`: select `auth.users` ids with
`email_confirmed_at is null and created_at < now() - 7 days`, delete their `user_settings` and `users`
rows in one `pinnedTx`, then `auth.admin.deleteUser` each id. Per-account failures are logged through
`logServerFailure` and skipped, like `sweepBunny`. An unconfirmed account cannot sign in, so those two
rows are all it can own; an old account that also has alert rows from before this change fails its
delete, is logged, and is left for a manual look. Only the count is logged, never addresses.

### Admin alert on confirmation

`notifyAdminsOfSignup` moves from `signUp` to `/auth/confirm`: after a successful `verifyOtp` whose
`type` is `signup` (the only type the confirmation template sends; `email` would also match OTP
sign-ins), look up the
`users` row for the now-signed-in account and call it. `verifyOtp` refuses a reused token, so it fires
once. `signup.server.ts` itself does not change.

### Reads and writes

No Zero queries are involved. All reads (`auth.users`, `users`) and writes (spent challenges, the
account rows, deletions) are server-side in remote functions, the confirm handler and the cron task.

## Risks / Trade-offs

- [PoW is beaten by a real headless browser] -> Accepted; it prices volume, which is what bombing
  needs. The honeypot and the reset gate hold regardless.
- [Slow phones wait on the solve] -> Tune on a throttled low-end profile; solve starts on page load,
  so typing hides it. Submitting before it finishes waits for it rather than failing.
- [Flipping `disable_signup` before the admin-API sign-up deploys breaks sign-up for everyone] ->
  Deploy first, run `e2e/prod-signup.spec.ts`, then flip, then run it again.
- [Stale tabs across the deploy submit without the new fields] -> Refused with a generic error asking
  for a reload; the service worker reloads stale tabs.
- [Admin API error leaks account existence] -> Explicit error mapping, covered by a test.
- [`resend` has its own GoTrue per-address cooldown] -> Only one resend per sign-up; a person who
  re-submits within the cooldown gets the existing "email sent" answer.

## Migration Plan

Ship in four commits, each deployable alone:

1. Reset gate and honeypot.
2. ALTCHA plus the spent-challenge table (runs a migration).
3. Admin-API sign-up and the shared admin client. Deploy, run the prod canary, flip `disable_signup` in
   the Supabase dashboard, flip the `check-prod.ts` assertion, run the canary again. Rollback: flip
   `disable_signup` back; the admin path keeps working with it off.
4. Unconfirmed-account cleanup and the alert move.
