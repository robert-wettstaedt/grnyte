# Proposal

## Why

Issue 1182, the comments package of R1 (issue 1145). Since 1177 the PowerSync build reads a comment thread from the app server and asks it again after an own write, on return and back online; since 1180 the region's events marker asks the event reads again when it moves. Three gaps remain before comments work without a Zero read:

- An own emoji, on a card or on a comment, shows only after the write's round trip and the refetch that follows it. The Zero build flips the chip at once, through the toggle mutator's client body, which never runs in the PowerSync build.
- An open thread never shows another member's new comment until the reader writes, leaves or comes back, although the comment already moves the region's events marker (the `reactions_sync_event_comment_count` trigger updates `events.comment_count`, and `events_touch_marker` notes the region).
- The report buttons ask the app server for the caller's open reports, although 1177 syncs exactly those rows to the device (`content_reports` in the `essentials` stream). A report an admin closes stays "Reported" on screen until the read is asked again.

## What Changes

- The emoji toggle shows the reader's choice at once in either build, as `sync/mutations` ("Toggles apply instantly") already requires: while a toggle is out, and until the read agrees, the bar shows the reader's own emoji as chosen; a refused toggle shows the read again, with no toast, as on `develop`; `sync/mutations` now says so. In the Zero build the toggle mutator's stand-in row already shows it, so nothing on screen changes there.
- In the PowerSync build, a move of the region's events marker also asks every open thread again (the `listComments` reads), beside the event reads 1180 asks.
- In the PowerSync build, the report buttons and the report form read the caller's open reports from the device, through a PowerSync twin of `report/resources.svelte.ts`.
- Records: `CONTEXT.md` ("change marker" and "server read" name the threads among the reads the marker asks; the report reads come off the device).

Nothing is client-breaking: no URL, remote function export, mutator, route, schema or `manifest.id` changes. Production builds Zero, where the stand-in row keeps the read in agreement with the overlay, so production behaves as before.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `sync/server-reads`: a thread on screen is also asked again when the region's events marker moves.
- `sync/mutations`: "Toggles apply instantly" holds in a PowerSync build too, with a scenario for reacting; "A refused toggle reverts and explains" exempts an emoji reaction from the toast, as the code has always done.
- `moderation/content-reports`: the Reported state follows the reporter's open reports as the device holds them in a PowerSync build, so a closed report stops reading Reported without a reload.

## Non-goals

- Another member's emoji (on a card or a comment) or comment edit showing live. Neither moves a marker: `reactions` has no marker trigger, and an edit or an emoji leaves `events.comment_count` as it was. They show on the next refetch (any marker move, own write, return, back online). A marker trigger on `reactions` would move every open feed of the region on every tap; live reactions and a thread stream are R2's (`migrate-sync-to-powersync-milestone/roadmap.md`).
- The inbox and `user_counters` (issue 1181, running in parallel). Stopping the Zero client start (1183).
- Narrowing a thread refetch to the event that was commented on: every open thread is asked, as every event read is.
- Any schema, stream or trigger change, and any deployment of a PowerSync build.

## Impact

- Entity modules: `reaction` (`mapper.ts`), `report` (a new `resources.powersync.svelte.ts`). Components: `Reactions/toggle.svelte.ts`, `Reactions.svelte`, `CommentReactions.svelte`. Tables: none changed; `content_reports` is read on the device. Routes: none (`report/[kind=removable]/[id]` reads through the twin unchanged). Remote functions: none.
- Sync: `state/engine.powersync.ts` (one line), `powersync/twins.ts` (one entry).
- Copy: none.
- 1181 also edits `engine.powersync.ts` (its `user_counters` line); whichever merges second rebases over the neighbouring line.
- Size: 1 day.
