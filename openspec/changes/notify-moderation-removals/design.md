# Design

## Context

See proposal.md for why and the specs for the behaviour. Facts that shape the approach:

- Every delete is a server function an entity mutator wraps: `deleteAreaRow`, `deleteBlockRow`, `deleteRouteRow`, `deleteTopoRow`, `deleteAscentRow`, `deleteMediaFileRow`, `deleteCommentRow`, each gated by `requireRow` on the stored row, so each already holds the row's author when it decides.
- `deleteCommentRow` soft-deletes (`reactions.deleted_at`) and, through `dropComment` on the privileged handle, soft-deletes the replies and their inbox rows; `restoreCommentRow` and `restoreReplies` undo both by timestamp. Comments.svelte shows the remover an inline Undo row (`gone`, `focusTarget`).
- `notify` (`notification/notification.server.ts`) filters recipients by their settings through `notificationRecipients`; `notification/sourceType.ts` declares each source type's push category and whether it writes an inbox row. `ascent_deleted` already tells a climber that someone else deleted their ascent, without a reason.
- `notificationSourceType` is a TypeScript list on a `text` column: a new type needs no migration, only `generate:zero`.
- The app-admin screens `settings/errors` and `settings/feedback/inbox` are remote reads (`remoteResource`) gated on app admin, which is the pattern for the decisions list.
- After `request-account-deletion`, author columns are nullable and `deleteAccountData` is the one place a person's links are cut.
- After `region-deletion`, a region has an owner (`regions.created_by`, always an active admin, not a role). Ownership grants no protection from moderation: the owner's content is removed and noticed like any member's, and the owner moderates as an admin.

## Goals / Non-Goals

**Goals:**

- One recording and notifying function every delete path calls, so a type cannot be wired without the notice.
- A decision record that reporting can attach to without reshaping it.

**Non-Goals:**

- Reworking the delete paths beyond the extra argument and the one call.
- A region-level log, and email.

## Decisions

### One table, written by one function

`moderation_decisions`: `id`, `region_fk`, `actor_fk` (the admin, nullable for account deletion), `object_type` and `object_id` (what the admin picked), `ground` (enum of the six grounds), `reason` (text, required), `created_at`, `reversed_at`, `reversed_by_fk`. A child table `moderation_decision_subjects` lists each affected author (`decision_fk`, `user_fk` nullable, a short description of what of theirs went), because one area removal can reach several authors. A report table will reference `moderation_decisions` later.

A new `moderation/record.server.ts` exports `recordRemoval(tx, { regionFk, actorFk, object, ground, reason, subjects })`, called inside each delete path's transaction before its first delete, so the subjects are collected from rows that still exist. It writes the decision and subjects and queues the notices with `afterCommit`. Each delete path gains an optional `{ ground, reason }` argument; absent means tidying up, and the path refuses it for a comment by another member.

Alternative rejected: a trigger on each content table. It would not know the ground or the admin's choice, and it would fire on cascades the admin never chose.

### Who counts as an affected author

The delete path collects, from the rows it is about to remove, every distinct non-null `created_by` that is not the admin. For an area that walks its blocks, routes, topos, ascents and files; `deleteRegionRows` already lists those tables in order and the same queries serve here. A comment's subjects are its author only, since replies stay (placeholders).

### The notice bypasses settings for the inbox only

A new source type `content_removed` (and `content_restored`) in `sourceType.ts` with `row: true` and the directed push category. `notify` gains a path that skips `notificationRecipients`' settings filter for inbox rows while still applying it to push, the one case where a notice is a legal statement rather than a nudge. The caption renders ground, reason, region and the clause 13 appeal line from the decision, joined at read time, so the notice row stays small.

### The notice is keyed by its decision

`notifications_source_idx` is unique over recipient, source type, actor, region and the object columns, and `notify` upserts on it. A removal notice cannot point at the removed object, which is gone, so every notice one admin sends one author in one region would share a key and the second would overwrite the first, the trap that swallowed the region handover notice. `notifications` gains `decision_fk` (references `moderation_decisions`, on delete cascade), added to the unique key; the three-year purge then takes its notices with it. A test pins that two removals by one admin of one author's content write two notices.

### Undo and reversal

Undo calls the restore path of the content type with the decision id: it sets `reversed_at`, deletes unread `content_removed` rows for the decision, and writes `content_restored` for read ones. Areas, blocks, routes, ascents and comments soft-delete (`deleted_at`); areas, blocks, routes and comments already offer Undo, and the app-admin reversal restores any of the five. Topos and media files hard-delete, so their reversal marks the decision reversed and tells the author, and clause 13 already says restoring is done where technically possible.

### Placeholders replace cascading reply deletes

`deleteCommentRow` stops calling `dropComment` for replies when they belong to other people: the root is soft-deleted with a `removed_by` marker (`author` or `admin`), and the comment list keeps a soft-deleted root that still has live replies, rendered as a placeholder. A root with no live replies stays hidden as today. `restoreReplies` remains for rows already cascaded before this change.

### Screens

Today deletes use four patterns: instant with an Undo toast (area, block, route), a native `confirm()` (topo), the shared `Dialog` (ascent, media) and an inline Undo row (comment). Every admin delete, except of the admin's own ascent, media or comment, gains one choice step: whether a container holds someone else's rows is not known on the client, so the server decides who is affected.

- **Choice step**: the `Dialog` from `confirm-steps-on-mobile`, titled with the item and saying who added it, with the destructive main action "Tidy up", the second action "Breaks the rules…" and Cancel. Tidy up runs today's delete with today's outcome (Undo toast, or the ascent and media result); it replaces `confirm()` for an admin's topo delete and the existing ascent and media confirm. For area, block and route the "…" menu closes first, then the dialog opens after `await tick()`.
- **Removal page** `/remove/[kind]/[id]`, one id-based route for the seven types. It is a `Form` page with the usual page chrome, `waitFor` on the item and on a remote preview of who will be told, so the submit waits for both. From the top: the content being removed (name and description excerpt for area, block and route; the photo for a topo or media; climber, route and note for an ascent; the full text of a comment), the six grounds as radio buttons, a required reason up to 500 characters, the who-will-be-told line, and "Remove and notify". A refusal shows on its field; nothing asks before leaving, like every other form. On success it goes where today's delete goes, with a toast saying the authors were told and an Undo where the type has one.
- **Comment**: admins see the trash action on other people's comments, labelled Remove; it navigates straight to the removal page, which closes the comment sheet. Undo comes back as the toast on return, not the inline row.
- Maintainers see no change: their deletes stay instant or `confirm()`.

The input lives on a page rather than in a sheet: at the height the form needs, a sheet leaves the content it covers dimmed and unreadable, while the page puts that content beside the reason; and a written, appealable decision is the "complex task" the HIG gives a full-screen view, not the quick scoped task a sheet suits.

The notice screen `/notices/[decisionId]` shows each removed item by name, the region, the ground, the reason and a "Write to us" `mailto:` with the decision reference in the subject. It answers only a decision subject or an app admin; anyone else gets not-found, region admins included, since a per-region log is a non-goal. The inbox row and push name the item (a comment's first ~80 characters), sum several items into one line, and say "a region admin".

The app-admin list is `settings/moderation/+page.svelte`, a remote query plus a reverse command, mirroring `settings/feedback/inbox`.

### Retention and account deletion

The cleanup cron deletes decisions older than three years. `deleteAccountData` nulls `actor_fk`, `reversed_by_fk` and `moderation_decision_subjects.user_fk` for the person.

## Risks / Trade-offs

- [Seven delete paths each need the call] → `gates.test.ts`-style ratchet: a test lists every delete mutator and fails when one does not reach `recordRemoval` for another member's row.
- [Hard-deleted topos and media cannot be restored on appeal] → stated in clause 13 already; the decision still records the reversal and the author is told.
- [The preview and the delete can disagree if content changes in between] → the delete recomputes the subjects in its transaction; the preview is only what the admin reads.
- [Collecting subjects for a large area walks many rows] → only on the rule-breaking path, which is rare; tidying up skips it.
- [Changing the author's own thread-root delete] → existing cascaded rows stay as they are; only new deletes keep replies.
- [Notice bypassing settings] → limited to `content_removed` and `content_restored`; a test pins that other types still honour settings.

## Migration Plan

One migration, 0139, for the two tables, the `removed_by` marker and `notifications.decision_fk`. Ships in the same release as account deletion, migration first, zero-cache, then the app, with one member email for the terms changes in both.
