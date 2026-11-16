# Proposal

## Why

grnyte keeps an account's address when Apple is removed, even when that address is Apple's private relay (`keepAddress` in `identities.server.ts`; removing a provider never changes the address). Apple then is the only party that knows when that address stops working: a person can turn relay forwarding off, stop using Apple with grnyte, or delete their Apple Account, and grnyte hears none of it, because it handles no Sign in with Apple server-to-server notification today. The person keeps an address that silently drops every mail, including the codes that change it.

## Builds on

Three changes that add Sign in with Apple and Google and are released together, all unarchived. Their code is committed on `feature/harden-auth-codes`, `feature/add-social-sign-in` and `feature/add-native-auth-handoff`, and this change's branch starts from the last. Their OpenSpec folders are not committed; this proposal restates what it relies on:

- **`harden-auth-codes`**: re-authentication ("confirm it's you" by a mailed code, recorded as a grant), the `guard_auth_identity` trigger on `auth.identities`, the auth event log.
- **`add-social-sign-in`**: Apple and Google sign-in, linking and unlinking in settings (an unlink never leaves an account without a password or another provider, and never changes its address), and "Confirm with Apple": an Apple-linked person may prove their Apple ID instead of entering a mailed code on every re-authentication step, so a relay address that stops forwarding does not lock them out of sensitive actions. Before deleting the account or removing Apple, Confirm with Apple also revokes grnyte's Apple authorization.
- **`add-native-auth-handoff`**: the native app's sign-in, including the Apple key set grnyte already fetches to verify Apple's tokens.

Decisions settled while planning those changes (in a decisions file outside the repo), which this change touches:

- Apple server-to-server notifications and Google's equivalent were out of scope, to revisit if App Review asked or relay mail bounced. This change revisits the Apple half (R1).
- Changing the address uses secure email change: codes go to both the current and the new address, and both must be entered.
- A person who lost their provider account is helped by a support runbook (`deployment/README.md`, "Support runbooks": verify ownership, change the email by hand, then forgot password). R10 tightens how it verifies ownership.

## What Changes

- **One notification endpoint.** `POST /api/webhooks/apple/sign-in` receives Apple's notification (`{ "payload": "<JWS>" }`), verifies it with the Apple key set grnyte already fetches, checks issuer, audience and issue time, and acts on the `type` in its `events` claim. Nothing else authorizes it. Its URL is registered once at Apple and must never move.
- **`email-disabled`**: grnyte records that the relay address no longer forwards. The email screen in settings shows a banner saying mail to the address does not reach the person and how to get a working address (R3), pointing to support when Apple is no longer linked (R9 covers the settings home row). grnyte's own mails skip that address, and a re-authentication step says so and offers Confirm with Apple. GoTrue's mails cannot be skipped and are rejected by the relay. A real address someone shared with Apple is never marked.
- **`email-enabled`**: clears that record, so the banner goes and mail resumes.
- **`consent-revoked`**: when the account has another way in, Apple is removed from it (the address stays), the removal notice is mailed and every device is signed out. When Apple is the only way in, Apple stays linked and every device is signed out; the next "Continue with Apple" asks Apple's consent again and lands in the same account (R4, R5).
- **`account-deleted`**: as `consent-revoked`, and the Apple identity's relay address is recorded as no longer forwarding. The grnyte account is never deleted on Apple's word (R6).
- **grnyte's own revocation is not an Apple event.** A `consent-revoked` or `account-deleted` within 10 minutes of grnyte starting its own revocation is ignored, so it cannot sign the person out in the middle of that action (R7).
- **Order, replay and loss.** A notification older than what grnyte already applied changes nothing; a repeated one changes nothing, and never removes an Apple re-added or signs out a device signed in after it; one older than a day is refused; a lost one is not recovered (R8).
- **No way-in race.** Removing a provider is refused in the database when it would leave no way in, so the notification and a removal on another device cannot together lock an account out.
- **Auth event log.** Each notification Apple signed for grnyte is recorded with its type and outcome, never an address or Apple's `sub`. One signed for grnyte that fails a check alerts admins on a spike; any other refused request (not signed by Apple, or an Apple-signed token that is not a notification for grnyte) is not recorded.

### Changes to the three changes' behaviour

1. **Identity trigger** (`guard_auth_identity`, `0149_auth_guards.sql`): gains rule 2b (the notification handler may remove an Apple identity in the transaction that names it) and a last-way-in floor for every Apple or Google removal, GoTrue's unlink included.
2. **`sendEmail` / `sendEmailOutcome`** (`src/lib/email/send.server.ts`): refuses, without calling Resend, an address recorded as not forwarding, with a new outcome `'suppressed'`. Every grnyte mail (re-authentication codes, notices, membership and region mails, feedback replies) is affected, except the account deletion mail, sent after the forwarding record is gone with the account; GoTrue's are not.
3. **Re-authentication** (`issueReauthCode`, `reauthSteps.server.ts`, `ReauthStep.svelte`): a suppressed code mail says the address receives no mail and offers Confirm with Apple instead of the generic send failure. `feedback.remote.ts` reports a suppressed reply to the admin as such.
4. **Confirm with Apple** (`acceptAppleConfirmation`): records `apple_revoke_started` before calling Apple's revoke.
5. **`/settings/email`**: a banner. The email change flow itself is unchanged under R3's recommendation. `unlinkProvider` shows the last-method message, not "service unavailable", when the new floor refuses GoTrue's unlink.
6. **Sign-out without the person**: an Apple notification ends the account's sessions, which until now only the person (sign out other devices, unlink, password change) or account deletion did.
7. **Event log** (`src/lib/auth/events.server.ts`): new kinds, one new failure kind, and `hasRecentAppleRevocation` replaced by `recentAppleEvent`, which its one caller calls directly.
8. **Sign-in methods** (`methods.server.ts`, `identities.server.ts`): `signInMethods` takes an optional transaction and also returns the identity count and `relinks`; `accountMethods` loses its own query and becomes an exported pure function over that result. `verifyAppleIdToken` is rebuilt on a shared `verifyAppleJwt`, and `exchangeAppleCode` and `revokeAppleToken` on one `postAppleToken`, behaviour unchanged.

## Resolved rulings

Each line was a contradiction with a settled decision or an addition no decision covered. The user ruled on all of them as recommended (2026-11-16); the specs, design and tasks follow these rulings. The alternatives are kept for the record.

- **R1 (contradiction)**: handle Apple's notifications now, although notifications were out of scope until App Review asked or relay mail bounced. Ruled: yes, because keeping the address on removal leaves no other way to learn a relay address died.
- **R2 (addition)**: on `email-disabled`, show a banner and stop grnyte's own mails to the address. Ruled: yes. Alternative: banner only, and let the relay reject the mails (Resend counts each as a bounce).
- **R3 (addition; B contradicts secure email change)**: how a person with forwarding off gets another address. Secure email change mails a code to the current address, which the relay now rejects. Ruled **A**: the banner tells them to turn forwarding back on in their Apple Account settings, change the address in grnyte, then turn it off again if they want; no flow changes. **B**: Confirm with Apple replaces the current-address code for an account whose address is recorded as not forwarding (a server-side address change outside GoTrue's secure change; needs Apple still linked, so it fails after `consent-revoked`). **C**: the support runbook only.
- **R4 (addition)**: `consent-revoked` with another way in removes Apple and signs out every device. Ruled: yes, since Apple says the person's credentials are now invalid. Alternative: remove Apple, keep sessions.
- **R5 (addition)**: `consent-revoked` when Apple is the only way in keeps Apple linked (removing it would leave no way in) and signs out every device. Alternative: change nothing.
- **R6 (addition)**: `account-deleted` never deletes the grnyte account, also when Apple was the only way in and the relay is dead (the account then stays unreachable: under R10 support cannot verify a person who can no longer sign in). Alternative: delete such an account under `deleteAccount`'s rules (sole-owner regions still block it).
- **R7 (addition)**: ignore `consent-revoked` and `account-deleted` for an account whose own revocation started in the last 10 minutes. Whether Apple sends `consent-revoked` after grnyte's own revocation is unverified; the device test records it.
- **R8 (addition)**: no fallback for a lost notification (Apple documents no retry). Alternative, later and separate: a Resend bounce webhook that marks an address undeliverable on a hard bounce.
- **R9 (addition)**: whether the settings home's Email row says the address receives no mail. Ruled: no; the person learns it on the email screen and at the next re-authentication. A person who opens neither does not learn it. A marker would replace the address (which can wrap to two lines at 375px) after the row rendered, so the row could shrink, which the loading rules forbid. Alternative: show the marker and accept the shift, or load the state with the page so it is known before the row renders (a server load the settings routes do not have today).
- **R10 (contradiction with the support runbook)**: the runbook's ownership check ("answers what only the owner can (their regions, recent ascents)") is passed by any member of the same regions, and this change sends people to support. Ruled: tighten it. Support changes an address only for a person who proves it from inside their account: signed in, they send a one-time phrase support gave them through in-app feedback, whose row records the sending account. Knowledge of regions, ascents or any other data other members can see never counts. A person who can no longer sign in at all (Apple-only, Apple Account deleted) cannot be verified, and support says so instead of changing the address. Alternative: accept the risk.

## Non-goals

- Google's account event feed (RISC) or any other provider's.
- Resend bounce or complaint webhooks (R8).
- Deleting a grnyte account on Apple's word (R6).
- Changing the email change flow (unless R3 rules B).
- Suppressing GoTrue's own mails (codes, reset, notices), which go out over SMTP outside grnyte's code.
- The native app's `getCredentialState` check; the app reads the server's state.
- Any prompt to add a second sign-in method.

## Capabilities

### New Capabilities

- `auth/apple-account-events`: how grnyte accepts Apple's account notifications, what each changes in grnyte (mail forwarding, the Apple identity, sessions), how out-of-order, replayed and lost notifications behave, and what the person sees in settings.

### Modified Capabilities

None in `openspec/specs/`. The behaviour changes listed above land in capabilities the three earlier changes introduce and have not archived (sign-in methods, re-authentication); this change states them as its own requirements instead of deltas to unarchived specs.

## Impact

- **Routes (new)**: `src/routes/api/webhooks/apple/sign-in/+server.ts` (POST), beside `api/webhooks/bunny`. No browser posts to it, so `crossSiteGuard` needs no exemption (no cookie, no `Sec-Fetch-Site`).
- **Routes (changed)**: `src/routes/(app)/settings/email/+page.svelte` (banner); `src/routes/(landing)/legal/privacy/privacy.en.html` and `privacy.de.html` (section 2.10).
- **Remote functions**: new export `mailForwardingQuery` in `src/lib/auth/identities.remote.ts`. Additive: no export moves or is renamed, so loaded tabs keep working and show the banner from their next load.
- **Shared code**: `src/lib/auth/app/appleToken.server.ts` (one shared `verifyAppleJwt`), new `src/lib/auth/oauth/appleSignInEvents.server.ts`, new `src/lib/auth/mailForwarding.server.ts`, `src/lib/auth/events.server.ts`, `src/lib/auth/identities.server.ts`, `src/lib/auth/methods.server.ts`, `src/lib/auth/oauth/providers.server.ts` (`postAppleToken`), `src/lib/auth/oauth/linking.server.ts`, `src/lib/auth/reauth.server.ts`, `src/lib/auth/reauthSteps.server.ts`, `src/lib/auth/ReauthStep.svelte`, `src/lib/auth/mail.server.ts` (`noticeAppleRemoved`), `src/lib/entities/feedback/feedback.remote.ts`, `src/lib/email/send.server.ts`, `src/lib/email/account.ts` (the removal mail's template).
- **Tables**: new server-only `apple_mail_forwarding` (one row per account, address hashed, cascade-deleted with it; no backfill); trigger function `guard_auth_identity` replaced with rule 2b and the last-way-in floor. Migration `0151` (after the stack's `0150`; coordinate with other branches before `generate:drizzle`). Not synced to clients.
- **Entity modules**: none. `user`'s `deleteAccount` is untouched: the forwarding row cascades with `auth.users`.
- **Configuration**: the endpoint URL in the App ID's Sign in with Apple configuration at Apple (prod; ngrok for local), `deployment/README.md` runbook, and its "Support runbooks" ownership check rewritten (R10). No new env var: audiences are `APPLE_SERVICES_ID` and `APP_BUNDLE_ID`.
- **Copy and legal**: `messages/en.json`, `messages/de.json` (`settings_mailForwarding*`, `auth_mailUndeliverable*`, `email_appleRemoved*`). `CONTEXT.md` gains "mail forwarding". The privacy notice says what Apple now tells grnyte and what grnyte keeps and does with it.
- **Operations**: `deployment/SECRETS.md` notes that rotating `SUPABASE_SECRET_KEY` resets every stored forwarding state.
- **Client-breaking**: none. The endpoint URL is new and, once registered at Apple, must never move. A tab loaded before the deploy lacks the new message keys, so the server's `auth_mailUndeliverable*` errors show there as raw keys until reload (`resolveMessage` falls back to the key); this needs a forwarding row, which exists only once the endpoint has received a notification after the deploy, so the window is short.
