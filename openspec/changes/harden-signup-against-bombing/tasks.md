# Tasks

## 1. Reset gate and honeypot

- [x] 1.1 In `forgot-password.remote.ts`, call `resetPasswordForEmail` only when `authUsers.emailConfirmedAt` is set for the (lowercased) address, returning `{ email, success: true }` on every branch; verify with a server test covering confirmed, unconfirmed and unknown addresses, seen red by removing the confirmed check
- [x] 1.2 Add an optional honeypot field to the `signUp` and `forgotPassword` schemas, returning the normal success shape without calling GoTrue when it is filled; verify with server tests seen red by removing the early return
- [x] 1.3 Render the honeypot input in both forms (off-screen CSS class, `autocomplete="off"`, `tabindex="-1"`, `aria-hidden="true"`); verify in the running app that tabbing skips it and a password manager autofill leaves it empty (password-manager autofill not driven: rests on the data-* opt-outs)
- [x] 1.4 Verification sweep for group 1 (prettier, eslint, `vitest --project server`, typecheck) and commit

## 2. Proof-of-work (ALTCHA)

- [x] 2.1 Add `altcha` and `altcha-lib`, and derive the challenge HMAC key from `SUPABASE_SERVICE_ROLE_KEY` (no new secret); verify with a test that the key is stable and differs from its parent
- [x] 2.2 Add the `spent_challenges` table to `schema.ts` with RLS enabled and no policies, run `generate:drizzle`, exclude it in `generate:zero`, `migrate`; verify the migration applies on a throwaway DB and the Zero schema does not list it (kept in the generated Zero schema like `client_error_logs`: drizzle-zero has no exclusion list and no client query reads it)
- [x] 2.3 Add the challenge `GET` endpoint under `(landing)/auth/` (10-minute expiry, `no-store`); verify with a test that two calls return different challenges (tested on `issueChallenge`, which the endpoint returns as is)
- [x] 2.4 Add `requireProofOfWork` in `$lib/forms/` (verify signature and expiry, then insert into `spent_challenges`, refusing when nothing was inserted); verify with server tests for missing, tampered, expired and replayed payloads, each seen red
- [x] 2.5 Call `requireProofOfWork` first in `signUp` and `forgotPassword`; verify with a test that a refused payload never reaches GoTrue
- [x] 2.6 Add `ProofOfWork.svelte` in `$lib/forms/` (bundled widget, starts solving on mount, submit waits for the solve) and render it in both forms; verify with the Svelte autofixer and by signing up in the running app
- [x] 2.7 i18n: keys for the widget's labels and the "reload and try again" refusal in `messages/en.json` and `messages/de.json`; verify both locales render in the running app (the widget runs `display="invisible"` and shows no labels, so the refusal is the only new key: `auth_verificationFailed`)
- [x] 2.8 Add `sweepSpentChallenges` to `api/tasks/cleanup`; verify with a server test that expired rows go and live rows stay
- [x] 2.9 Tune `maxNumber` to about 1 second on a mid-range phone, measured on the iOS Simulator and a CPU-throttled 375x667 Chrome profile; record the chosen value in a one-line comment (browser solve ~90ms per 1000 attempts on 12 laptop workers; the phone figure is extrapolated, since the iOS Simulator runs on the host CPU and DevTools throttling does not slow workers)
- [x] 2.10 Verification sweep for group 2 and commit

## 3. Accounts only through the admin API

- [x] 3.1 Verify against the local stack with `disable_signup` on: `auth.admin.createUser` creates an unconfirmed user, `auth.resend({ type: 'signup' })` sends the confirmation, and `/recover` sends nothing for an unknown address; record the outcome in design.md and switch to the `generateLink` fallback if resend refuses (settled from GoTrue source at v2.167.0, the local version, and master: only the public `Signup` handler reads `DisableSignup`; `resend` mails only an existing unconfirmed account; `/recover` answers an unknown address with 200 and sends nothing. No fallback needed)
- [x] 3.2 Move the service-role client into `$lib/db/supabaseAdmin.server.ts` and use it from `api/tasks/cleanup`; verify the cleanup server tests still pass
- [x] 3.3 Change `signUp` to `admin.createUser` plus `resend`, keeping the `users`/`user_settings` transaction; verify with server tests, including that an already-registered address answers exactly as before (seen red by surfacing the admin error) (an existing address resends and answers success, matching the public endpoint, which returns a sanitized fake user; the old handler then hit a users FK error. Driven end to end against the local stack: account created, one confirmation caught, `/auth/confirm` confirmed and signed in)
- [x] 3.4 Flip `deployment/check-prod.ts:37` to assert `disable_signup === true`; verify it fails against the current environment and passes after the switch (fails locally, where public sign-up is still on)
- [ ] 3.5 Run `e2e/prod-signup.spec.ts` and `e2e/invite.spec.ts` against the local stack with `disable_signup` on; verify both pass and the confirmation email arrives unchanged
- [x] 3.6 Verification sweep for group 3 and commit
- [ ] 3.7 After deploy (user): run the prod canary, switch off "Allow new users to sign up" in Supabase, run `npm run check:prod` and the canary again

## 4. Cleanup and alert

- [ ] 4.1 Add `sweepUnconfirmedAccounts` to `api/tasks/cleanup` (7 days, rows in one `pinnedTx`, then `admin.deleteUser`, per-account failures logged and skipped, count-only logging); verify with a server test that a 6-day-old and a confirmed account survive, seen red by dropping the age filter
- [ ] 4.2 Move `notifyAdminsOfSignup` from `signUp` to `/auth/confirm` after a successful `verifyOtp` of type `signup` or `email`; verify with a test that sign-up alone sends no alert and confirmation sends one
- [ ] 4.3 Check the privacy notice says nothing that deleting unconfirmed accounts after 7 days contradicts; verify by reading its account-retention section
- [ ] 4.4 Verification sweep for group 4 and commit

## 5. Final verification

- [ ] 5.1 Over every touched path: `npx prettier --write`, `npx eslint`, `npx vitest run --project server` and `--project browser` as matching, typecheck (`svelte-check` beside a live dev server), `npm run lint:duplication`, `npm run lint:unused`
- [ ] 5.2 Drive sign-up and forgot-password in the running app at 375x667 and 1280x800, in English and German, including a screen-reader pass over the honeypot; verify no puzzle is shown and both flows complete
