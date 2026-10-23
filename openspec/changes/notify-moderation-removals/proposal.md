# Proposal

## Why

Terms clause 12 says a region admin deleting another member's content is a restriction that owes a statement of reasons, and admits the app sends none: the member has to write in. Admins can remove other people's areas, blocks, routes, topos, ascents and media today, but not their comments, so abusive or unlawful comments have no in-app remedy, and a deleted author's comments cannot be removed by anyone. The reporting feature the app stores require will need the same decision record, so it is built once, here.

## What Changes

- A region admin can remove another member's comment. Emoji reactions are out of scope.
- When an admin deletes another member's content (area, block, route, topo, ascent, media, comment), they choose why: **tidying up** (duplicate, mistake, outdated) or **breaks the rules**. Tidying up is recorded and notifies nobody. Breaks the rules requires a ground from a list drawn from clause 7 and a short written reason, records a moderation decision, and notifies every distinct author whose content it removed. A comment removal is always the rule-breaking path.
- Every delete an admin makes, except of their own ascent, media or comment, first asks: tidy up, which deletes at once as today, or breaks the rules, which opens a removal form page showing the content, the grounds, the reason and who will be told. Removing a comment goes straight to that page. Maintainers' deletes are unchanged.
- The notice is an in-app notification that always lands in the inbox, whatever the person's notification settings; push follows those settings. One notice per person per removal sums up what of theirs went, in which region, removed by "a region admin" without a name. It opens a notice screen, visible only to that person and app admins, with each removed item, the ground, the reason and a link to write in under clause 13. A deleted account is not notified.
- Tidying up someone else's ascent keeps today's `ascent_deleted` notice; nothing else tidied up notifies anyone.
- Maintainers keep their clause 15 rights but may only tidy up; a rule-breaking removal is an admin's call.
- Undo after a rule-breaking removal restores the content, marks the decision reversed and withdraws an unread notice; a read one gets a short "restored" follow-up.
- A comment that has replies is never removed with them. Removed by an admin, it stays as a "Removed by a region admin" placeholder; deleted by its author, a "Deleted by its author" placeholder. The replies stay. **BREAKING (behaviour)**: an author deleting their own thread root no longer takes other people's replies with it.
- A new `moderation_decisions` table records each rule-breaking removal: what, where, which admin, the ground and reason, when, and whether it was reversed. Decisions are deleted after three years, and an account deletion removes the person's link but keeps the record.
- An app-admin screen under `/settings` lists decisions and can reverse one, for appeals.
- Terms clause 15 lists comment removal among admin powers and clause 12 drops its "does not notify you" limit. They ship in the same release and email as account deletion.

## Non-goals

- In-app reporting of content by members. It is the next change, and attaches reports to `moderation_decisions`.
- A per-region moderation log for region admins.
- Removing emoji reactions.
- Email notices.
- Moderating edits: an admin editing someone's route is upkeep, not a restriction.

## Capabilities

### New Capabilities

- `moderation/removal-decisions`: how a removal of someone else's content is classified, recorded, told to its authors, reversed and retained.
- `comments/removed-placeholders`: what a thread shows when a comment with replies is removed by an admin or deleted by its author.

### Modified Capabilities

None.

## Impact

- **Tables**: new `moderation_decisions`; `notifications` gains source types (a TypeScript list, no migration) and a `decision_fk` column in its unique key; `reactions` may gain a removal marker for the placeholder. Schema pipeline: `schema.ts`, `generate:drizzle`, `generate:zero`, `migrate`. The migration is 0139, after `request-account-deletion`'s 0138.
- **Entity modules**: the delete paths `area/lifecycle.server.ts` (`deleteAreaRow`), `block/lifecycle.server.ts`, `route/lifecycle.server.ts`, `topo/edit.server.ts`, `ascent/lifecycle.server.ts`, `file/edit.server.ts` (`deleteMediaFileRow`) and `reaction/edit.server.ts` (`deleteCommentRow`, `restoreCommentRow`) gain the tidy-up or rule-breaking choice; `notification/notification.server.ts` gains the notice; `user/delete.server.ts` (`deleteAccountData`) unlinks people from decisions; the cleanup cron deletes decisions after three years.
- **Mutators**: the delete mutators' arguments widen with an optional ground and reason. Widening only, so already-loaded tabs keep working; deploy zero-cache, then the app.
- **Routes**: a new app-admin screen under `/settings` beside `errors` and `feedback/inbox`; a new notice screen `/notices/[decisionId]`; a new removal form page `/remove/[kind]/[id]`; area, block, route, topo, ascent and media deletes by an admin gain the two-way choice step.
- **Legal**: terms clauses 12 and 15, English and German.
- **Depends on**: `request-account-deletion`, released first in the same release, for the null-author rendering and `deleteAccountData`; `confirm-steps-on-mobile`, landed first on this branch, for the choice step's second action.
