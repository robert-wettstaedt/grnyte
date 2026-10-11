# Proposal

## Why

Bots are using grnyte's sign-up and forgot-password forms for subscription bombing: they enter real
people's addresses (Gmail dot-variants included) with random usernames, then request a password reset
seconds later, so each victim gets two grnyte emails. The target is the victim's inbox, not grnyte,
but every complaint costs sender reputation, and GoTrue's one project-wide email limit means a large
wave would lock real people out of sign-up and password resets. It is a handful a day now; these
waves grow.

## What Changes

- A password reset is sent only to an address whose account is confirmed. The form answers the same
  way whether an email was sent or not.
- Sign-up and forgot-password carry a honeypot field (hidden from people, password managers and
  screen readers) and a self-hosted proof-of-work check (ALTCHA) that the browser solves in the
  background. Each solved check is valid for 10 minutes and accepted once.
- Accounts are created only by the server, through the Supabase admin API. Public sign-up is switched
  off in GoTrue, closing the direct `/auth/v1/signup` route the public anon key would otherwise leave
  open. GoTrue still sends the confirmation email, triggered through its resend endpoint.
- Accounts left unconfirmed for 7 days are deleted with their profile rows.
- The admin sign-up alert fires on email confirmation instead of on sign-up, so bot accounts no
  longer page an admin.
- **BREAKING (config):** GoTrue's `disable_signup` flips to `true`, and `npm run check:prod` asserts
  the new value.

## Non-goals

- Any third-party captcha or bot service (Turnstile, hCaptcha, reCAPTCHA, Friendly Captcha): no new
  processor, no change to the privacy notice.
- Anything new on the VPS. The check runs inside the existing SvelteKit server.
- Stopping a targeted attacker with a real headless browser. Proof-of-work raises the cost of volume;
  it is not a human test.
- Protecting sign-in. It sends no email, so it is not part of this attack.
- Translating the confirmation email.
- IP rate limiting (every GoTrue call arrives from Vercel, and the reported bot waves send about one
  request per IP).

## Capabilities

### New Capabilities

- `auth/sign-up-protection`: what sign-up and password reset must refuse, and which emails the app
  may cause to be sent to an address that has not proved it belongs to the person using it.

### Modified Capabilities

None.

## Impact

- Routes: `(landing)/auth/(tabs)/signup` (page and `signup.remote.ts`),
  `(landing)/auth/forgot-password` (page and `forgot-password.remote.ts`), `(landing)/auth/confirm`
  (`+server.ts`), `api/tasks/cleanup`, plus one new endpoint that issues ALTCHA challenges.
- Entity modules: `notification/signup.server.ts` (alert moves to confirmation).
- Tables: `auth.users` (read for confirmation state, deleted by the cleanup), `users` and
  `user_settings` (deleted with an expired unconfirmed account), and one new table of spent ALTCHA
  challenge signatures, which holds no personal data.
- Dependencies: `altcha` (widget) and `altcha-lib` (server), both MIT.
- Config: GoTrue `disable_signup`, `deployment/check-prod.ts`.
- Client-breaking across the deploy: the `signUp` and `forgotPassword` exports keep their names and
  files, but their schemas gain the proof-of-work and honeypot fields. A tab loaded before the deploy
  submits without them and is refused with a generic "reload and try again" error until it reloads
  (the service worker reloads stale tabs within the hour). No URL, remote-function name or
  `manifest.id` changes.
