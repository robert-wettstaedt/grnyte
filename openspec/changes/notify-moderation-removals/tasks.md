# Tasks

## 1. Decision record

- [ ] 1.1 Add `moderation_decisions` and `moderation_decision_subjects` to `schema.ts` with the six-ground enum and a `removed_by` marker on `reactions`, and `notifications.decision_fk` (on delete cascade) added to `notifications_source_idx`; run `generate:drizzle` (0139) and `generate:zero`, migrate the dev DB from the main checkout, and verify the tables with `\d`
- [ ] 1.2 Add `moderation/record.server.ts` `recordRemoval` writing a decision and its subjects; verify with a server test that one call with two subjects writes one decision and two subject rows (seen red)
- [ ] 1.3 Make `deleteAccountData` null `actor_fk`, `reversed_by_fk` and subject `user_fk`, and extend its account-deletion test's no-references check to the new tables (seen red)
- [ ] 1.4 Delete decisions older than three years in the cleanup cron; verify with a server test (seen red)

## 2. Notices

- [ ] 2.1 Add `content_removed` and `content_restored` to `notificationSourceType` and `sourceType.ts`, with captions in `messages/en.json` and `messages/de.json` naming ground, reason, region and the clause 13 appeal; verify the caption with a unit test
- [ ] 2.2 Let `notify` write inbox rows for these two types regardless of settings while push still honours them; verify with a server test that a person with notifications off gets the row and no push, and that another type still honours settings (seen red)
- [ ] 2.3 Queue the notices from `recordRemoval` after commit, one per distinct live subject, none for a deleted account, keyed by `decision_fk`; verify with a server test, including that two removals by one admin of one author's content write two notices (seen red)

## 3. Comments

- [ ] 3.1 Let a region admin remove another member's comment through `deleteCommentRow` with a ground and reason, refusing maintainers and members; verify with server tests (seen red)
- [ ] 3.2 Keep other people's replies when a thread root is deleted or removed, marking the root `removed_by`; verify with a server test that replies survive both paths (seen red)
- [ ] 3.3 Render a removed root that has live replies as "Removed by a region admin" or "Deleted by its author", and hide it once no reply remains; i18n keys in both locales; verify with `Comments.svelte.test.ts` cases (seen red)
- [ ] 3.4 Add the admin Remove action to other people's comments, navigating to the removal page; verify with a component test that a maintainer sees no action (seen red)
- [ ] 3.5 Erase the words of deleted comments in the cleanup cron: an author's own delete once its Undo window has passed, an admin removal only once its decision can no longer be reversed (the row stays for replies and placeholders); update the terms clause 19 sentence on deleted comments to match; verify with server tests for both kinds (seen red)

## 4. Guidebook and ascent deletes

- [ ] 4.1 Add the removal page `/remove/[kind]/[id]` as a `Form` page: the content preview per type, six ground radios, a required reason up to 500 characters, the who-will-be-told line and "Remove and notify", with i18n keys in both locales; verify with a page test that submitting without a reason refuses on the field (seen red)
- [ ] 4.2 Add the remote preview of who will be told for a rule-breaking removal, refusing when nothing belongs to another member; verify with a server test (seen red) and that submit stays disabled until it answers
- [ ] 4.3 Wire `deleteAreaRow`, `deleteBlockRow` and `deleteRouteRow` to an optional ground and reason, collecting subjects from the rows they remove; verify with a server test that an area holding two authors' routes notifies both (seen red)
- [ ] 4.4 Wire `deleteTopoRow` (admins only for rule-breaking, maintainers tidy up only), `deleteAscentRow` and `deleteMediaFileRow`; verify with server tests (seen red)
- [ ] 4.5 Widen the delete mutators' arguments with the optional ground and reason, and add a ratchet test that every delete mutator reaches `recordRemoval` for another member's row (seen red with one path unwired)
- [ ] 4.6 Open the choice step (Tidy up, Breaks the rules…, Cancel) on every admin delete except their own ascent, media or comment: after the "…" menu closes for area, block and route; in place of `confirm()` for topo; in place of the existing confirm for ascent and media; maintainers unchanged. Breaks the rules navigates to the removal page. Keep `ascent_deleted` for a tidy-up ascent delete. Verify on each screen and with a test that a maintainer gets no choice (seen red)
- [ ] 4.7 Add `/notices/[decisionId]`: removed items, region, ground, reason and a "Write to us" `mailto:` with the decision reference; not-found for anyone but a subject or an app admin; verify the gate with a server test (seen red)

## 5. Undo and reversal

- [ ] 5.1 Undo a rule-breaking comment removal: restore, set `reversed_at`, withdraw unread notices, send `content_restored` for read ones; verify with a server test (seen red)
- [ ] 5.2 Add `settings/moderation` for app admins: a remote query listing decisions and a reverse command; verify the gate in `gates.test.ts` and a server test for the reverse (seen red)
- [ ] 5.3 Link the screen from the admin section of `/settings`

## 6. Legal

- [ ] 6.1 Draft terms clause 15 (admins remove comments; maintainers tidy up only) and clause 12 (the in-app notice replaces the "does not notify you" limit), English and German, for review

## 7. Verification

- [ ] 7.1 Drive at 375x667 and 1280x800, en and de, light and dark, with throwaway accounts: admin removes a comment root with replies (placeholder, notice with reason, Undo withdraws it), admin removes an area holding two authors' routes (two notices), maintainer deletes a topo (no rule-breaking option), app admin reverses a decision; clean up every fixture
- [ ] 7.2 Run the AGENTS.md sweep over the touched paths: prettier, eslint, `vitest --project server` and `--project browser`, svelte-check, `lint:duplication`, `lint:unused`

## Workflow follow-up

- Branches from `feature/region-deletion` (PR 1100), which also edits terms clause 15.
- Implement after `confirm-steps-on-mobile` has landed on this branch.
- Ship in the same release as account deletion, with one member email for both terms changes.
- Archive after release and legal approval.
