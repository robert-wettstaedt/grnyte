# Tasks

## 1. Nullable authors

- [x] 1.1 In `schema.ts`, drop NOT NULL from `created_by` on `regions`, `areas`, `blocks`, `routes`, `files` and `feedback` (keep it on `ascents`), and from `reactions.user_fk`, `reactions.auth_user_fk` and `activities.user_fk`; run `generate:drizzle` and `generate:zero`, and verify the migration holds only those `DROP NOT NULL` statements
- [x] 1.2 Apply the migration to the dev DB from the main checkout (`npm run migrate`) and verify with `\d` that the columns are nullable
- [x] 1.3 Add `authorName(fk, author)` to `entities/displayName.ts` ("Deleted user" for a null author, empty while syncing), with the i18n key `users_deleted` in `messages/en.json` and `messages/de.json`, and verify with a unit test that a null author maps to it
- [x] 1.4 Make the `dto`, `mapper` and `permissions` of `area`, `block`, `route`, `file` and `region` accept a null author; verify svelte-check is clean (the predicates already take `createdBy?: null | number` and compare `=== userId`, so a null author grants nothing and no test was added). Media and region bylines show "Deleted user" without a profile link, each with a mapper test
- [x] 1.5 The same for `reaction`, `event`, `feedback` and `activities` readers (comment author, event card actor, feedback inbox, change history); verify svelte-check is clean and a comment with a null author renders "Deleted user" in a component test (seen red)
- [x] 1.6 Check that `/users/<id>` for a missing user renders the not-found state and a `!users:id!` reference to a missing user renders the reference tombstone; add a test only where the behaviour is missing

## 2. Region removal

- [x] 2.1 Add `deleteRegionRows(tx, regionFk)` in `src/lib/entities/region/` deleting every row of a region bottom up, routing `files` through `deleteFileRows` and returning the storage targets; verify with a server test against a seeded region that no row with its `region_fk` survives and the targets list every file (seen red)

## 3. Account removal

- [x] 3.1 (tested through `deleteAccount`, the agreed seam) Add `classifyRegions(tx, user)` in `src/lib/entities/user/delete.server.ts`, under `lockRegionMembers`, returning blocking, sole-member and shared regions; verify with server tests for sole admin with members (blocking), second admin (shared), only member (sole) and inactive-only members (sole), each seen red
- [x] 3.2 Add `deleteAccountData(tx, user)` applying the design's table plan (delete, unlink, region whole) and returning storage targets and affected route ids; verify with a server test that seeds every referencing table for the person and a second user, then asserts the person's rows are gone or unlinked and every row of the second user is untouched (seen red)
- [x] 3.3 Verify in the same test file that a person with a comment thread root, an emoji reaction, a first ascent link and a member they invited leaves the thread, reaction, first ascent name and member in place with null links, and the invitation itself gone
- [x] 3.4 Add `deleteAccount(user, password)` running password check, `pinnedTx` with refusal before the first write, then `recalcUserGradeAndRating`, `auth.admin.deleteUser` and `removeFileStorage` after commit; verify with server tests that a wrong password and a blocking region change nothing, and that a route's community grade recomputes without the deleted ascent (seen red)
- [x] 3.5 Widen `sweepUnconfirmedAccounts` so its query also takes confirmed `auth.users` rows with no `public.users` row older than an hour, and replace its hand-written deletes with `deleteAccountData`; verify with a server test that a lone auth row is deleted and one with a profile is not (seen red)
- Dropped 3.6 (replace `deleteAccountRows` with `deleteAccountData`): the teardown also serves the production sign-up canary and deliberately fails 23503 rather than touch content tables, and Playwright specs import it outside Kit, so it stays a separate, narrower copy.

## 4. Remote command

- [x] 4.1 Add a `deleteAccountSchema` (one `password` field) to `src/routes/(app)/settings/schemas.ts` and a `deleteAccountCommand` to `account.remote.ts` calling `deleteAccount`, refusing a wrong password on the `password` field and a blocking region with `settings_deleteAccountBlocked` plus the region names; verify in `account.remote.test.ts` both refusals and a success through `asRequest` (seen red)

## 5. Screen

- [ ] 5.1 Add i18n keys for the screen (title, what goes, what stays, regions that block, regions that will be deleted, password label, submit, success, blocked refusal) to both `messages/en.json` and `messages/de.json`, sorted, with no em-dashes; copy through `/writing-guidelines`
- [ ] 5.2 Add `src/routes/(app)/settings/account/delete/+page.svelte` with `PageHeader`, the three region lists from Zero queries, and a `Form` over the command; on success run the sign-out wipe (`src/lib/state/wipe.ts`) and go to the landing page with a confirmation toast; verify with a component test that a blocking region disables submit (seen red)
- [ ] 5.3 Add the "Delete account" row to the account section of `src/routes/(app)/settings/+page.svelte`, using `resolve()` for the parameterless route, and verify it navigates there

## 6. Legal

- [ ] 6.1 Draft the terms clause 19 edit in `terms.en.html` and `terms.de.html` (comments, reactions and guidebook media stay anonymised; ascents and their media go; deletion is self-serve and immediate) and hand it to the user for review
- [ ] 6.2 Draft the privacy section 7 edit and remove the "no self-serve button" sentence in `privacy.en.html` and `privacy.de.html`, and hand it to the user for review

## 7. Verification

- [ ] 7.1 Drive the flow in the running app at 375x667 and 1280x800, en and de, light and dark, with throwaway accounts: a shared-region member (content stays as "Deleted user", ascents gone, second device's token reads nothing), a sole admin with members (refused, regions named), and a sole member (region gone, files removed from storage); clean up every fixture
- [ ] 7.2 Run the AGENTS.md sweep over the touched paths: prettier, eslint, `vitest --project server` and `--project browser`, svelte-check, `lint:duplication` and `lint:unused`

## Workflow follow-up

- Ship the migration before the app in the release, deploying zero-cache first.
- Before deploying, count confirmed `auth.users` rows with no `public.users` row in production: the widened cleanup sweep deletes them on its first run, so any that exist for another reason must be resolved first.
- Archive the change once the release is live and the legal text is approved.
