# Design

## Context

See proposal.md for why, and `specs/auth/account-deletion/spec.md` for the behaviour. The facts that shape the approach:

- About 25 columns reference `public.users` or `auth.users`. All of them except `client_error_logs.created_by` are `ON DELETE NO ACTION`, so deleting a `users` row fails while anything still points at it. `users.user_settings_fk` and `user_settings.user_fk` point at each other, and so do `users.first_ascentionist_fk` and `first_ascensionists.user_fk`.
- Two partial deletes exist: `db/testAccounts.ts` (`deleteAccountRows`, a test teardown that works only for accounts that created nothing) and `user/unconfirmed.server.ts` (`sweepUnconfirmedAccounts`: rows in a `pinnedTx`, then `auth.admin.deleteUser` outside it).
- File removal exists: `file/cleanup.server.ts` `deleteFileRows` deletes `files` and `bunny_streams` rows and returns storage targets, and `removeFileStorage` deletes them from storage after commit, best-effort.
- Route grade and rating are stored, not computed: `routes.userGradeFk` and the rating, kept in step by `route/user-grade.server.ts` `recalcUserGradeAndRating`, which `ascent/lifecycle.server.ts` already calls after deleting one ascent.
- The last-admin rule exists: `region/guards.server.ts` `activeAdminUserFks`, `assertNotLastAdmin` and `lockRegionMembers`.
- A request whose token maps to no `public.users` row already resolves to `user: undefined` with no regions (`hooks/auth.server.ts` `loadSessionUser` and `read`), so a still-valid access token for a deleted account reaches nothing.
- No code deletes a region today.
- `account.remote.ts` already re-authenticates with `signInWithPassword` for email and password changes.

## Goals / Non-Goals

**Goals:**

- One server function that removes an account and everything the spec says goes, in one transaction, reusable later by an `/api/v1` caller for the native app.
- Every refusal (wrong password, last admin) decided before the first write.

**Non-Goals:**

- A second copy of the delete order in production code. `sweepUnconfirmedAccounts` calls `deleteAccountData`, and its query widens to cover a lone `auth.users` row instead of adding a new sweep. The test teardown `deleteAccountRows` stays narrower on purpose: the production sign-up canary uses it, and it fails rather than touch content tables.
- Soft-deleting the account or keeping a tombstone `users` row.

## Decisions

### A remote command, not a mutator

`deleteAccount` is a `command` in `src/routes/(app)/settings/account.remote.ts`, beside `updateEmailCommand` and `updatePasswordCommand`. AGENTS.md keeps auth and account work as remote functions, and this one has to call GoTrue twice (`signInWithPassword` and `auth.admin.deleteUser`), which a Zero mutator's transaction must not do. Its body is a plain function in a new `src/lib/entities/user/delete.server.ts`, so a later `/api/v1` route is a thin second caller. The screen posts through the existing store form (`createFormStore` and `Form`), with one `password` field.

### Order: verify, then one transaction, then GoTrue, then storage

1. Verify the password with `signInWithPassword` on an anon client (the `verifyPassword` helper in `account.remote.ts`). A wrong one refuses with a field issue on `password`.
2. One `pinnedTx`, running as the privileged login role because it crosses every region the person belongs to and the RLS policies do not grant deleting other people's content:
   - `lockRegionMembers` for every region the person is an active member of, then decide per region: blocking (sole active admin with other active members), sole member (deleted whole), or shared. Any blocking region refuses with the list of region names before the first write.
   - Sole-member regions: delete the region and everything in it (below).
   - Shared regions and everything else: the table plan below.
   - Collect storage targets from every `deleteFileRows` call and the routes whose votes changed.
3. After commit: `recalcUserGradeAndRating` for each affected route that still exists, then `supabaseAdmin().auth.admin.deleteUser(authUserId)`, then `removeFileStorage(targets)`.

The alternative of deleting the `auth.users` record first was rejected: if the transaction then failed, the person would have rows and no way to sign in to them. Committing first leaves at worst a sign-in record with no profile, which already reaches nothing.

A GoTrue failure is logged through `logServerFailure`, and `sweepUnconfirmedAccounts` (run by `src/routes/api/tasks/cleanup/+server.ts`) widens its query: confirmed `auth.users` rows with no `public.users` row, older than an hour, get `deleteUser` again. Signup creates both rows in one transaction (`signup.remote.ts`), so a lone `auth.users` row only ever means a deletion that did not finish.

### Table plan

Deleted (for the person, in every region):

- `ascents` they created, with `files` attached to them (`deleteFileRows`); their `events` and `changes` cascade.
- `events` and `changes` where they are the actor or the subject; `notifications` where they are the recipient, the actor or the subject.
- `region_invitations` they sent, pending and accepted. An accepted one is history only: the membership row grants access, and nothing reads an accepted invitation's inviter.
- `favorites`, `push_subscriptions`, `user_roles`, `region_members`.
- `user_settings` (after clearing `users.user_settings_fk`), then `users`.
- `client_error_logs.created_by` is already `ON DELETE SET NULL`; the policy says their error-log references go with the account, so their rows are deleted, not nulled.

Unlinked (column set to null):

- `regions`, `areas`, `blocks`, `routes`, `files`: `created_by`.
- `reactions`: `user_fk` and `auth_user_fk`, for comments and emoji alike.
- `activities.user_fk`, `feedback.created_by`.
- `first_ascensionists.user_fk` (after clearing `users.first_ascentionist_fk`), keeping `name`.
- `region_members.invited_by`, and `region_invitations.accepted_by` on invitations other people sent them.

Region deleted whole: the region's rows bottom up, every `files` row through `deleteFileRows` so storage targets are collected, then the region. This is a new `deleteRegionRows` in `src/lib/entities/region/`, written so a future admin "delete region" action can reuse it.

### Schema: nullable authors

One migration drops `NOT NULL` from `regions`, `areas`, `blocks`, `routes`, `files` and `feedback` `created_by` (through `baseContentFields` where it applies; `ascents.created_by` stays NOT NULL because ascents are deleted, not unlinked), `reactions.user_fk`, `reactions.auth_user_fk` and `activities.user_fk`. Pipeline: `schema.ts`, `generate:drizzle`, `generate:zero`, `migrate`. No backfill; existing rows keep their authors. RLS policies comparing `created_by` to the caller already evaluate to false for null, which is the right answer: nobody owns an orphaned row, and maintainers and admins keep their region-level rights.

Every reader of an author gets `null` handling: the `dto`, `mapper` and `permissions` of `area`, `block`, `route`, `file`, `region`, `ascent`, `feedback`, `reaction` and `event`. "Deleted user" comes from the display-name mapper (`entities/displayName.ts`), never an inline fallback, per AGENTS.md. `markdownReferences` already renders a missing `!users:id!` as `REFERENCE_TOMBSTONE`. The profile route `/users/[id]` reads a missing row as not found through `QueryState`.

### The screen

`src/routes/(app)/settings/account/delete/+page.svelte`, a full-screen settings route with `PageHeader`, the same as the username, email and password screens. Reads are Zero queries: the person's active memberships and each region's active members and admins, to show blocking regions before the password is entered (the server decides again under lock). Copy says what goes and what stays, in plain words. On success the client runs the existing sign-out wipe (`src/lib/state/wipe.ts`) so this device keeps no local Zero data, and navigates to the landing page with a confirmation.

### Legal

The terms clause 19 and privacy section 7 edits, in `terms.{en,de}.html` and `privacy.{en,de}.html`, ship in the same release as the button, so the text never describes behaviour that is not live. They are drafts for the user's review.

## Risks / Trade-offs

- [Another device keeps its local Zero replica until it reloads, so data cached there stays readable offline] → The server refuses every read and write for the token; the replica is the same exposure as a signed-out device that never reloaded. Accepted.
- [The privileged transaction bypasses RLS] → It touches only rows selected by the person's own ids, and the refusals are checked first under lock. Tests cover a second user's rows surviving untouched.
- [A long transaction for a heavy account, with a large sole-member region] → It runs once per account; deletes are by indexed foreign key. If it proves slow, the region half can move to its own transaction before the account half.
- [Nullable authors ripple through every mapper and permission] → The type change makes each unhandled reader a compile error, and the permission tests gain a null-author case.
- [Adding a remote export across a deploy] → New export only, no move or rename, so open tabs are unaffected.
- [`client_error_logs` loses a deleted person's rows, removing debugging context] → That is what the privacy policy promises.

## Migration Plan

One release: migration (nullable columns), then the app with the route and the legal edits. Deploy order is the usual one: zero-cache, then the app. Rollback: the nullable migration is safe to leave in place; reverting the app removes the button. Re-adding NOT NULL is only possible while no account has been deleted.

The screen also lists the regions that will be deleted with the account (the ones where the person is the only active member), since losing a whole region without warning would be a surprise. It is the same query as the blocking list, split three ways.
