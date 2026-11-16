# Design

## Context

See proposal.md for why, and its Resolved rulings, which this design follows.

State this change starts from (the stack's tip, `feature/add-native-auth-handoff`):

- `src/lib/auth/app/appleToken.server.ts`: `appleKeys.source` is one `createRemoteJWKSet` on `https://appleid.apple.com/auth/keys` per process; `verifyAppleIdToken` runs `jwtVerify` through `taggingJwks` (from `verify.server.ts`), so a key-fetch failure is `JwksUnavailable` and anything else is invalid.
- `src/lib/auth/identities.server.ts`: `unlinkProvider` checks `accountMethods(...).canUnlink` (at least two identities, and a password or another provider left) in its own unlocked read, then asks GoTrue to unlink behind an `identity.unlink` grant, then `keepAddress` puts the address back if GoTrue moved it.
- `drizzle/0149_auth_guards.sql`: `guard_auth_identity` refuses an identity delete on a confirmed account unless a transaction-local marker (rules 1 and 2, set only by triggers on `auth.users`) or a live grant (rule 6) allows it. A grant needs a `session_id`, which a notification has none of. Nothing in the database stops a delete that leaves no way in; only `unlinkProvider`'s earlier read does.
- `src/lib/auth/events.server.ts`: `recordAuthEvent` (never throws, own `pinnedTx`), `FAILURES` for the spike alert, `hasRecentAppleRevocation(authUserId, action, target)`.
- `src/lib/auth/oauth/linking.server.ts`: `acceptAppleConfirmation` ("Confirm with Apple": the person proves their linked Apple ID in place of a mailed code before a sensitive action) calls `revoke()` at Apple for account deletion and Apple removal, and records `apple_revoked` or `apple_revoke_failed` after Apple answers.
- `src/lib/auth/reauth.server.ts` `issueReauthCode` mails a re-authentication code through `sendEmail`; `src/lib/auth/reauthSteps.server.ts` maps its `'limited'` and `'unsent'` results to form errors; `src/lib/auth/ReauthStep.svelte` renders them and offers "Confirm with Apple" when Apple is linked.
- `src/lib/auth/mail.server.ts`: grnyte's own notices (`noticePasswordChanged` on `recipient(id)`, which supplies locale and sign-in methods).
- `src/lib/entities/user/delete.server.ts`: `deleteAccount` ends sessions with `delete from auth.sessions where user_id = …` in its transaction.
- `src/lib/db/serverOnly.ts`: server-only tables are plain `public` tables, so zero-cache's replica holds a copy; `appAuthFlows` hashes what it stores for that reason.
- `src/lib/forms/gate.ts`: a `Form` `waitFor` needs a non-null row with an `id`.
- `src/routes/api/webhooks/bunny/+server.ts`: the house shape of a signed webhook (raw body, verify, 401/400/204).
- GoTrue sends its own mail over SMTP (Resend); grnyte's own mail goes through `sendEmail` / `sendEmailOutcome`.

Apple's contract ([processing changes](https://developer.apple.com/documentation/signinwithapple/processing-changes-for-sign-in-with-apple-accounts), [private relay](https://developer.apple.com/documentation/signinwithapple/communicating-using-the-private-email-relay-service)): a POST with `{ "payload": "<JWS>" }` signed with Apple's key, validated with the header's `alg`; claims `iss`, `aud`, `iat`, `jti`, `events` with `type`, `sub`, `event_time`, and for forwarding events `email` and `is_private_email`. No `exp`. TLS 1.2+. One endpoint per App ID group. No retry or ordering promise is documented. Relay addresses stay active independent of sign-in; `account-deleted` invalidates all tokens and disables forwarding.

## Goals / Non-Goals

**Goals:**

- One verifier for every Apple-signed token grnyte reads.
- Every effect idempotent and ordered by Apple's `event_time`, so replays and reordering need no extra store.

**Non-Goals:**

- A `jti` replay table: every effect is idempotent or guarded by time (decision 6).
- Recovering lost notifications (R8).

## Decisions

### 1. Endpoint

`src/routes/api/webhooks/apple/sign-in/+server.ts`, POST only. Accepts JSON `{ payload }` only, the shape Apple documents; any other body is a 400. Answers:

| Case                                                                              | Status                                     |
| --------------------------------------------------------------------------------- | ------------------------------------------ |
| applied, or ignored (unknown type, no account, stale, own revocation)             | 200                                        |
| bad body, or a token whose signature does not verify against Apple's keys         | 400, not recorded (decision 8)             |
| signed by Apple but not a notification for grnyte (wrong `aud`, or no `events`)   | 400, not recorded (decision 8)             |
| a notification Apple signed for grnyte, `iat` out of window or `events` malformed | 400, recorded `apple_notification_invalid` |
| `JwksUnavailable`, or the database write threw                                    | 503                                        |

It reads no session and sets no cookie. `crossSiteGuard` passes it (no cookie, no `Sec-Fetch-Site`), as it passes Bunny's. Vercel terminates TLS 1.2+.

The path names the sender, then the feed in Apple's terms, so a later Apple feed (App Store Server Notifications) gets `/api/webhooks/apple/app-store` without a rename; the URL is registered at Apple and never moves. No version segment or secret in the path: the signature is the only authorization.

Alternatives: `/api/webhooks/apple` (rejected: claims the name every Apple feed would want); under `/auth/` (rejected: those paths run the auth hooks, the signed-in bounce and the profile gate); under `/api/app/v1/` (rejected: the native app's versioned Bearer API); "notifications" in the path or module name (rejected: grnyte's own push and digest messages already use that word).

### 2. Verification reuses Apple's key set

`appleToken.server.ts` gets one `verifyAppleJwt(token, options)` returning `{ ok: true; payload } | { ok: false; reason: 'invalid' | 'unavailable'; signed: boolean }`: the `jwtVerify` on `appleKeys.source` through `taggingJwks`, `algorithms: ['RS256']`, `issuer: 'https://appleid.apple.com'`, the caller's `audience`, `requiredClaims` and optional `maxTokenAge` and `clockTolerance`, and the `JwksUnavailable` try/catch that `verifyAppleIdToken` holds today. `verifyAppleIdToken` becomes that call plus its nonce check, behaviour unchanged (its tests stay green); `AppleVerdict` stays its return type. jose takes the algorithm from the header and refuses one outside the list, which is Apple's "validate with the header's `alg`" bounded to what Apple's key set declares (RS256: on 2026-11-16 all three keys in the live set were RS256, task 3.1).

The webhook calls `verifyAppleJwt(payload, { audience: [APPLE_SERVICES_ID, APP_BUNDLE_ID], requiredClaims: ['iat', 'events'], maxTokenAge: '1d', clockTolerance: '5m' })`. jose checks `iat` only when `maxTokenAge` is set; with it, a future `iat` (beyond the tolerance) or one older than a day is refused. A day leaves room for Apple's delivery delay, which it does not document (task 8.2 records it); the time guards in decision 6 cover replays inside that day.

To tell a forgery from a broken setup (decision 8), `invalid` carries `signed`: true exactly when jose threw `JWTClaimValidationFailed` or `JWTExpired`, which it throws only after the signature verified (`jwt_claims_set.js`; a too-old `iat` is `JWTExpired`). Every other refusal (`JWSSignatureVerificationFailed`, `JOSEAlgNotAllowed` for HS256 or `none`, `JWSInvalid`, a key-set miss) is `signed: false`.

Parsing `events` is webhook-only and lives in `appleSignInEvents.server.ts`: object or JSON string (implementations report the string; Apple's page shows an object), then zod in Apple's documented shape only: `type` string, `sub` string, `event_time` number, optional `email`, optional `is_private_email` as `"true"`/`"false"` (read by decision 4). No guesses at other units or types: task 8.2 records what Apple sends, and a mismatch is a recorded `apple_notification_invalid` that the spike alert surfaces. A plain number cannot reveal its unit, so `event_time` must lie within `[iat - 1 day, iat + 5 minutes]` of the verified token, read as seconds or as milliseconds (one value never fits the window in both units), and is converted to seconds once. Apple's live `email-disabled` on 2026-11-16 carried milliseconds (`1794861507552`), although its docs read as seconds; a value in neither unit fails as invalid instead of landing millennia ahead, where every time guard in decision 6 and the session bound in decision 7 would pass and every later `email-enabled` would be `stale`.

Before adding it, `appleToken.server.ts`'s `exchangeAppleCode` and `providers.server.ts`'s `revokeAppleToken` already repeat the same Apple token-endpoint call (client secret, form POST, `redirect: 'manual'`, 5 s timeout, warn on failure); one `postAppleToken(path, params)` in `providers.server.ts` replaces both bodies, behaviour unchanged.

Alternatives: a second `createRemoteJWKSet` (rejected: two caches for one key set); a sibling verifier copying the try/catch (rejected: two copies of the key-outage classification).

### 3. One transaction per event

`appleSignInEvents.server.ts` (new, `src/lib/auth/oauth/`) handles one event in three steps, so no `pinnedTx` is opened inside another (`pinned.server.ts`: one checkout per request):

1. Before: a plain read that matches the account, then for `consent-revoked` / `account-deleted` the own-revocation check on it (decision 6). No match: outcome `no_account`.
2. ONE `pinnedTx`: match again, lock, then decide and write from what that transaction sees. Matching: the `auth.identities` row with `provider = 'apple'` and `provider_id = sub` (with its `created_at` and `identity_data`); for `email-*` with none, the `auth.users` row whose `lower(email) = lower(events.email)`. No match: outcome `no_account`. Then `select … from auth.users where id = $1 for update`, and repeat the match under the lock (an address or identity changed in between gives `no_account`). On a deadlock (`40P01`) the transaction runs once more before the endpoint answers 503 (decision 7).
3. After commit: the event record (decision 8) and, for a removal, the notice mail (decision 7).

### 4. Mail forwarding state

New server-only table in `src/lib/db/serverOnly.ts`, RLS on, no policies, not synced to clients:

| column         | type                   |                                                                                    |
| -------------- | ---------------------- | ---------------------------------------------------------------------------------- |
| `auth_user_fk` | `uuid` pk              | references `auth.users(id)` on delete cascade                                      |
| `address_hash` | `text` not null        | HMAC-SHA256 of the lower-cased address, key `labelledKey('apple-mail-forwarding')` |
| `forwarding`   | `boolean` not null     |                                                                                    |
| `event_at`     | `timestamptz` not null | Apple's `event_time`                                                               |

The address is hashed, as `appAuthFlows` does, so zero-cache's replica copy holds no address; every reader only compares for equality.

A row is written only for an Apple relay address: `is_private_email` true, or (for `account-deleted`, which carries no address) the Apple identity's `identity_data` email with `is_private_email` true or the domain `privaterelay.appleid.com`. A real address a person shared with Apple is never marked: Apple's forwarding switch does not govern it (an `email-*` event for one records outcome `ignored`). `email-disabled` / `email-enabled` upsert `(account, address_hash, forwarding, event_at)` only `where excluded.event_at > apple_mail_forwarding.event_at` (outcome `stale` otherwise). `account-deleted` writes `forwarding = false` in the same transaction as the removal. Every write stores the address the event named and leaves "is it the current address" to the reader (decision 5). The row cascades with the account, so `deleteAccount` needs no edit, and a later change of address ends the banner and the suppression without a write.

Schema change: the new table only; nothing to backfill (no notification has been received before this change).

Alternative: a column on `public.users`. Rejected: that table syncs through Zero to every member, and this is a private fact.

### 5. What reads it

The rule "mail to this address goes nowhere" (a row with `forwarding = false` whose `address_hash` equals the address's hash) is written once, in new `src/lib/auth/mailForwarding.server.ts`: `notForwarding(addresses: string[]): Promise<Set<string>>`, one SQL statement over the hashes. Both readers pass current addresses (the query the account's own, `sendEmail` the recipients it is about to mail), so an account that moved to another address drops out without a write; a join to `auth.users` was dropped during apply, since it changed no outcome (slice 5.4's red check stayed green). Both readers call it:

- `mailForwardingQuery` (new export, `src/lib/auth/identities.remote.ts`, remote query, `requireLiveSession`): always a row, `{ id: <auth user id>, address: string | null, appleLinked: boolean }`, with `address` set from `notForwarding([current address])`. A failing lookup answers `address: null` (fail open, as the send side does), so the email screen never loses its form to it.
- `/settings/email`: `remoteResource(mailForwardingQuery())` becomes the screen's `Form` `waitFor` (it has none today; the row is never null, so the gate opens as soon as the query answers), so the existing `Banner` component is known before the form renders and never pushes it down. Its body depends on whether Apple is still linked: linked, `settings_mailForwardingOffBody` (turn forwarding back on in the Apple Account settings, then change the address here); not linked (Apple was removed by `consent-revoked` or `account-deleted`, or by the person), `settings_mailForwardingOffSupportBody` (if your Apple Account still exists, turn forwarding back on there; otherwise send support a message through Feedback while signed in, which is how support verifies them under R10, and support changes the address by hand). Both take `{address}`; the title is `settings_mailForwardingOff`.
- Settings home: no marker (R9). The Email row keeps showing the address; the email screen's banner and the re-authentication step (below) are where the person learns it. A marker on the home row would replace a value that can wrap to two lines at 375px (`SettingLink` wraps anywhere) with one that may not, which shrinks the row after it rendered.
- Re-authentication: `issueReauthCode` checks `notForwarding` before it counts a try or writes a challenge (it counts 5 per hour before sending today, and `ReauthStep` asks for a code by itself when Apple is not linked, so a check at send time would turn into `auth_tooManyTries` after five visits) and returns a new `'undeliverable'`; it also moves to `sendEmailOutcome` so a suppression decided between the check and the send gives the same result; `reauthSteps.server.ts` maps it to a new form error, `auth_mailUndeliverable` when Apple is linked (shown beside "Confirm with Apple") and `auth_mailUndeliverableSupport` when it is not (the support route above), instead of `auth_mailUnavailable`.
- `sendEmailOutcome` (`send.server.ts`): before calling Resend, drops the `to` addresses `notForwarding` returns; with none left it returns a new `SendOutcome` member, `'suppressed'`, without calling Resend or logging an address. `sendEmail`'s boolean stays false for it. The lookup failing does not block the send. Callers that tell someone something branch on it:
  - `issueReauthCode`, as above.
  - `feedback.remote.ts`'s `delivered: false` to the admin carries the reason.
  - The other `sendEmailOutcome` callers (`directed.server.ts`, `region/delete.server.ts`) compare with `'retry'` and `'sent'`, so `'suppressed'` already counts as "do not retry"; task 6.2 lists every caller with its handling.

### 6. Order, replay and loss

- Window: `iat` within a day and not in the future (decision 2).
- Forwarding: the `event_at` comparison in decision 4. A replay of the latest event is equal, so stale.
- Revocation: `consent-revoked` / `account-deleted` with `event_time` before the current Apple identity's `created_at` or `last_sign_in_at` is `stale` (the person re-added Apple, or kept Apple as the only way in and signed in with it again, which re-consents on the same row). The identity delete and the session delete are both bounded by `created_at <= to_timestamp(event_time)` (decision 7), so a late or repeated delivery never removes a re-added Apple and never signs out a session made after the event, also when Apple was kept as the only way in.
- Own revocation (R7): `acceptAppleConfirmation` records a new `apple_revoke_started` (action, target) before it calls `revoke()`. The handler skips any `consent-revoked` / `account-deleted` for an account with an `apple_revoke_started` in the last 10 minutes (outcome `own_revocation`). Recording before the call covers a notification that overtakes Apple's answer and a revoke whose answer was lost. `hasRecentAppleRevocation` becomes `recentAppleEvent(authUserId, kind, filter?)` in `events.server.ts`, and both its one existing caller (`appleRevocation`) and this check call it; no wrapper stays.
- Loss: nothing is polled. A lost `email-disabled` leaves mail bouncing silently (the R8 bounce webhook is the later answer); a lost `consent-revoked` leaves Apple linked, which signs in only with the person's consent at Apple anyway.

### 7. Removing Apple without a caller

In decision 3's transaction, after the `for update` lock on `auth.users`:

1. Re-read the account's methods in this transaction. Today two queries read them with the same password expression: `signInMethods` (`methods.server.ts`, six callers) and `accountMethods` (`identities.server.ts`, private, adds the identity count and `relinks`). First fold them: `signInMethods(authUserId, tx?)` runs the one query and also returns the identity count and each provider's `relinks`; `accountMethods` becomes a pure function deriving `canUnlink` from that result, exported. The "another way in" rule then exists once in TypeScript and the handler calls both in its transaction.
2. When `providers.apple.canUnlink`: `select set_config('grnyte.apple_identity_removal', '<user_id>:<sub>', true)`, then `delete from auth.identities where user_id = $1 and provider = 'apple' and provider_id = $2 and created_at <= to_timestamp($event_time)`. Otherwise skip (outcome `kept_only_method`).
3. `delete from auth.sessions where user_id = $1 and created_at <= to_timestamp($event_time)`.
4. For `account-deleted`, the forwarding row (decision 4).

Migration `0151` replaces `guard_auth_identity` (`CREATE OR REPLACE FUNCTION`) with two changes:

- **Rule 2b**, after the last-way-in floor below (so the floor guards the handler's own delete too): on DELETE, an `apple` identity whose `user_id:provider_id` equals the marker passes. Unlike rules 1 and 2, whose markers only triggers on `auth.users` set, this marker is set by application code with a plain `set_config`, which any session can call. What keeps it safe is that no role but the server's privileged one can delete from `auth.identities` (`authenticated` has no DELETE grant; the Data API is off); task 4.3 asserts that an `authenticated` transaction with a matching marker is still refused.
- **Last-way-in floor**, right after rule 3, for every DELETE of an `apple` or `google` identity: lock the account row (`select … from auth.users where id = … for update`), then refuse unless the account still has a password or another `apple`/`google` identity besides this one. The lock serializes two removals of different providers (the handler's and GoTrue's unlink from `unlinkProvider`, or two devices): whichever comes second waits, then counts what the first committed (each statement in a volatile PL/pgSQL function reads a fresh snapshot under READ COMMITTED). This closes a race that already exists between two devices removing two providers at once.
  - Both sides removing the SAME Apple identity (the handler, and the person removing Apple at that moment) can deadlock: GoTrue holds the identity row and waits for `auth.users`, the handler holds `auth.users` and waits for the row. Postgres aborts one. If the handler loses, it retries once (decision 3), matches nothing and records `no_account`, signing nobody out; the person's own removal already signed out their other devices (`unlinkProvider`'s `signOut({ scope: 'others' })`). If GoTrue loses, `unlinkProvider` refuses and the handler's removal stands. A GoTrue sign-in that touches the identity row and then `auth.users` can deadlock the same way, with other outcomes: if the handler loses, its retry still finds the identity, but that sign-in moved `last_sign_in_at` past `event_time`, so the retry records `stale` and changes nothing; if the sign-in loses, the person's sign-in fails once and they try again.
  - A refused GoTrue unlink reaches `unlinkProvider` as a server error, which `gotrueRefusal` maps to `auth_serviceUnavailable`. `unlinkProvider` therefore re-reads `accountMethods` before mapping: when the provider can no longer be removed, it refuses with `settings_signInMethodsLastMethod`, the message the person would have seen had the other removal finished first.

A direct SQL delete never moves the address (GoTrue's address move lives in its unlink endpoint), so `keepAddress` is not needed; a test asserts it.

GoTrue's identity-unlinked notice does not fire for a direct delete (task 8.2 confirms it on a real account), so after commit the handler sends `noticeAppleRemoved({ email, id })` (new, `src/lib/auth/mail.server.ts`, beside `noticePasswordChanged` and with its signature; `recipient(id)` supplies locale and methods, the address is the one the handler read under its lock), whose template `appleRemoved` lives in `src/lib/email/account.ts` beside `accountDeleted`, with keys `email_appleRemovedSubject`, `email_appleRemovedPreheader`, `email_appleRemovedBody`, `email_appleRemovedNotMe` and `email_appleRemovedMeta` (the `email_accountDeleted*` pattern). `sendEmail` drops it if forwarding is off.

Alternative: GoTrue's admin API. Rejected: supabase-js has no admin identity delete, and GoTrue's user endpoint needs the person's token.

### 8. Event log

`AuthEventKind` gains:

- `apple_notification`, detail `{ type, outcome }`. `type` is Apple's, so an unknown type is recorded as it came, with outcome `ignored`. Outcomes: `applied`, `removed`, `kept_only_method`, `stale`, `no_account`, `own_revocation`, `ignored`. One kind for every type keeps Apple's `account-deleted` apart from grnyte's own `account_deleted`.
- `apple_notification_invalid`, detail `{ reason }`, in `FAILURES`, only for a notification addressed to grnyte that fails a check: `signed` is true, the payload (read with `decodeJwt` once the signature verified) has `aud` equal to one of grnyte's audiences and an `events` claim, and it failed on `iat` or on `events`' shape. Apple sends such a notification only to grnyte's endpoint, so outsiders cannot obtain one to replay; a spike means grnyte's configuration or clock broke, which is what the alert is for.
- `apple_revoke_started`, detail `{ action, target }` (decision 6).

Everything else that fails is answered 400 and logged with `console.warn` (no body), never recorded: an unsigned or wrongly signed token, and any Apple-signed token not addressed to grnyte as a notification (someone's own ID token for grnyte or another app, a notification for another app). Anyone can obtain those, and recording them would let them fill `auth_events` and fire the spike alert.

Never an address or `sub`, as for the existing kinds.

### 9. Reads, writes, remote functions

- Reads: `mailForwardingQuery` (remote query). No Zero query.
- Writes: the webhook endpoint only. No mutator, no remote command.

### 10. As built (apply and implementation review, 2026-11-16)

Where the code settled differently from the decisions above:

- Decision 5: the fail-open lives once, inside `notForwarding` (a warning, then "every address forwards"). `mailForwardingQuery`, `sendEmailOutcome` and `issueReauthCode` call it directly, and the join to `auth.users` was dropped (slice 5.4's red check showed it changed nothing).
- Decision 7: `accountMethods` and `ProviderState` live in `methods.server.ts` beside `signInMethods`; `pinned.server.ts` exports the `Tx` type their transaction argument uses.
- Decisions 3 and 7: `lockedMatch` finds the account by Apple's user, locks `auth.users`, then reads the identity again filtered by that account, so a sign-in committing while the handler waited is `stale`; an account gone by then is `no_account`. Both paths write the forwarding row through one `storeForwarding`, which writes only a newer event. `removed` is recorded only when a row was actually deleted.
- Decision 1: the route answers 503 for any database failure past the one deadlock retry and logs only the error code, since drizzle's error carries the query's parameters.
- Decision 5: a suppressed feedback reply answers `{ delivered: false, undeliverable: true }`, keeps the row closed, and the inbox shows `feedback_replyUndeliverable`.
- Not fixed, listed in review.md: the email screen's banner after client-side navigation (a cached answer, like every `remoteResource` screen) and "Confirm with Apple instead" on an origin where Apple is not configured.

## Risks / Trade-offs

- [Apple sends `consent-revoked` after grnyte's own revocation, later than 10 minutes] → The person was already done with that action; the effect is removing an Apple that grnyte already revoked and a sign-out. Accepted; task 8.3 measures the delay.
- [Apple delivers a notification more than a day late] → It is refused as out of window and recorded; task 8.2 records the real delay.
- [Apple's audience is the primary App ID, not the Services ID] → Both `APPLE_SERVICES_ID` and `APP_BUNDLE_ID` are accepted; task 8.2 records the real `aud`.
- [A wrong or changed audience setting refuses every genuine notification silently] → A wrong-`aud` refusal is never recorded (recording it would let anyone flood the log with another app's notification), so the spike alert does not cover audience misconfiguration; only `console.warn` and task 8.2's recorded `aud` do. Accepted.
- [After the person removed Apple, Apple may send nothing more] → Apple documents no notifications once grnyte's authorization is gone (removed, or revoked through Confirm with Apple). Task 8.2 records what arrives. `account-deleted` for such a person never matches (no Apple identity, no address in the event), so their dead relay is never marked; accepted.
- [A fellow region member asks support to move someone's account to their own address] → R10: support accepts only a one-time phrase sent through in-app feedback from the account itself (`feedback.createdBy`), never knowledge of regions or ascents (task 8.0 rewrites the runbook).
- [An Apple-only account after `account-deleted` is unreachable] → R6 keeps it, and under R10 nobody can recover it: the person is signed out everywhere and has no way to sign in, so support cannot verify them. Their content stays; they can create a new account. Accepted.
- [GoTrue's own mails to a dead relay address] → Not stoppable from grnyte; the banner explains why they do not arrive, and every re-authentication offers "Confirm with Apple" while Apple is linked.
- [Forwarding off and Apple no longer linked: no code arrives and Confirm with Apple is gone] → No sensitive action is possible until the person turns forwarding back on (if the Apple Account still exists) or support changes the address by hand; the banner and the re-authentication step both say so.
- [`SUPABASE_SECRET_KEY` is rotated] → `labelledKey` changes, every stored `address_hash` stops matching, and grnyte mails dead relay addresses again until Apple sends the next forwarding event. Accepted; task 8.1 adds the effect to the rotation notes in `deployment/SECRETS.md`.
- [Signing out every device on `consent-revoked` surprises a person who only meant to stop Apple] → R4 alternative keeps sessions.
- [The last-way-in floor refuses a GoTrue unlink grnyte did not foresee] → It refuses only what `unlinkProvider` already forbids; task 4.1 runs the existing identity tests against it.
- [Zero keeps serving reads until the access token expires after the sign-out] → As for every other sign-out (accepted earlier, reads only).

## Migration Plan

1. Migration `0151` (renumber on merge if another branch took it): the table (no backfill) and the trigger's rule 2b and last-way-in floor. Rehearsed on a throwaway Postgres per AGENTS.md, never the shared dev DB.
2. Deploy the app with the endpoint.
3. Register `https://<prod origin>/api/webhooks/apple/sign-in` in the App ID's Sign in with Apple configuration (Apple Developer, Identifiers). Order matters: a notification before the deploy is lost (R8).
4. Device test (task 8.2) with a test Apple ID: forwarding off and on, Stop using Apple ID, while watching the event log.
5. Rollback: remove the endpoint URL at Apple, then revert the deploy. The table and rule 2b are inert without the endpoint; the last-way-in floor stays and only refuses what the app already refuses.

## Privacy notice

`src/routes/(landing)/legal/privacy/privacy.en.html` and `privacy.de.html`, section 2.10 ("Signing in with Apple or Google"), today describe Apple data only at sign-in and say only the person removes the Apple identity. They gain: Apple tells grnyte when the person turns forwarding off or on, stops using Apple with grnyte or deletes their Apple Account; grnyte then keeps whether their relay address forwards (as a keyed hash, deleted with the account), removes Apple when another way in remains and signs out their devices. Any retention list in the notice gains the forwarding state.

## Open Questions

- The exact delay between grnyte's revocation and Apple's `consent-revoked`, if Apple sends one (R7's 10 minutes may need widening).
