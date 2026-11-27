# Design

## Context

See proposal.md for why. Code facts (read 2026-11-26 at `80b2f692`):

- A thread is `commentList` (`reaction/resources.svelte.ts`) over the Zero query definition `listComments` (`reaction/queries.ts`), opened lazily by `createThread` (`components/Reactions/thread.svelte.ts`) from the feed's sheet and the event page. The `reaction` module has no PowerSync twin, so in the PowerSync build it is a server read (`defaultSource` in `zero/source.powersync.svelte.ts`).
- Comments and emoji are rows of one table, `reactions`, split by `type`. `reactions_sync_event_comment_count` (`drizzle/0115`) updates `events.comment_count` when a comment becomes live or stops being live (insert, soft delete, restore, a moderator's delete), top level and replies alike. That update fires `events_touch_marker` and `events_flush_markers` (`drizzle/0153`), which move `region_counters.events` once at commit. A comment edit and any emoji leave the count alone, so they move no marker; `sync_event_promoted` only ever sets `promoted` once.
- `engine.powersync.ts:98` wires `onMarkerMove('region_counters', () => refreshReads(['listEvents']))`. `onMarkerMove` keeps one callback per table (`db.svelte.ts:186`); `refreshReads(names)` takes query names of the registry and asks only the live reads with those names (`source.powersync.svelte.ts`).
- Card chips are folded by `reactionChips(reactions, currentUserFk)` (`reaction/mapper.ts:28`) from `listEvents`' `reactions` relation (`event/card.ts:241`); a comment's chips are folded by the same function from its `children` (`mapper.ts:63`). A chip is `{ count, emoji, mine, names }`; a reactor's name is `toAuthor(userFk, username).name`.
- `createReactionToggle` (`components/Reactions/toggle.svelte.ts`) holds `busy` per target and calls `toggleReaction`. In the Zero build the `reactions.toggle` mutator's client body clears the reader's held emoji on the target and adds the tapped one unless it was the one held, so the chip flips at once. In the PowerSync build `write()` posts to `/api/sync/mutate`, then `refreshReads()` asks every read; the chip moves only when that answer lands.
- `createSaveState` (`favorite/save.powersync.svelte.ts`) is the shipped shape for "the wanted state shows until the read agrees, dropped if refused".
- The report reads are `myOpenReport` and `myReportedIds` (`report/resources.svelte.ts`) over `myOpenReports`, used by `ReportButton`, `ReportRow`, `Comments.svelte`, `MediaViewer.svelte` and the report form route. `content_reports` is in the client schema (`powersync/schema.ts:63`, column map at `:349`) and synced in `essentials`, filtered to the caller's own reports in regions they are an active member of: the same rows `myOpenReports` answers. Closing a report deletes its row, so the device loses it on the next sync.
- A twin is a `*.powersync.svelte.ts` module beside its Zero sibling, listed as a `Fits` entry in `powersync/twins.ts` (`twins.test.ts` fails on a twin missing there), reading through `psResource` over `collections()` and mapping rows with `toZeroRow` (example: `favorite/resources.powersync.svelte.ts`).

## Goals / Non-Goals

**Goals:** an open thread follows other members' comments in the PowerSync build; an own emoji shows at once in both builds; the report reads come off the device in the PowerSync build; the Zero build behaves as on `develop`.

**Non-Goals:** see the proposal. Design-level: no schema, trigger, stream, query definition, mutator or remote function change.

Reads and writes, as the config asks: `listComments` and `listEvents` stay Zero query definitions, live Zero queries in the Zero build and server reads in the PowerSync build. `myOpenReports` stays the Zero build's query; the PowerSync build reads `content_reports` through the new twin. The one write is the existing mutator `reactions.toggle`, unchanged. No remote function changes.

## Decisions

### D1. The events marker also asks the threads

`engine.powersync.ts`: `onMarkerMove('region_counters', () => refreshReads(['listEvents', 'listComments']))`. No new marker: a comment's insert, delete or restore already moves the region's events marker through `comment_count` (Context), and the thread is only ever open on an event of the device's regions. Every open thread is asked, not only the commented one: a thread's arguments name an event, a move names nothing (1180 D1), and a screen holds at most two threads (sheet and event page).

Own comments: `write()` refreshes every read, then the marker moves and asks the thread once more. One redundant read per own comment, as 1180 accepted for own events.

Alternative: a marker trigger on `reactions` (a `region:` key in `touch_marker`), which would also carry others' emoji and comment edits live. Rejected for R1: every emoji tap in a region would refetch every open feed of that region, a migration and a trigger on a table written all day, for what R2's thread stream and local reactions replace.

### D2. The toggle holds the wanted emoji until the read agrees

One code path for both builds, no twin, in the shape of `createSaveState`. The Zero build keeps its stand-in row (the `reactions.toggle` client body, `reaction/mutators.ts:13-47`): it is a local write on the device, which survives a reload, the model the offline-writes work brings to PowerSync (milestone design D11). There the read agrees in the tap's turn, so the overlay shows nothing of its own; it does the work only in the PowerSync build, where writes are POSTs and reactions are not on the device. It is a stopgap like the favorite overlay, retired once reactions sync (R2) and toggles write locally (offline writes). `createReactionToggle(target, read)` gains `read: () => ReactionChip[]`, the chips the read gives (`bar.chips`, `comment.reactions`), and exposes a `chips` getter: what the bar renders. It keeps `wanted: { key, emoji: string | undefined } | undefined`, where `emoji` is what the reader should hold on the target after the toggle and `key` is the target (`eventId`, `commentId`).

A pure function in `reaction/mapper.ts`, `withOwnEmoji(chips, emoji, name)`, returns the chips with the reader's own emoji set to `emoji`: the chip marked `mine` loses one count, the mark and the reader's name (and goes at zero), and `emoji`'s chip gains one, the mark and the reader's name (appended when new, keeping first-seen order). Applied to chips that already agree, it returns them unchanged.

- `toggle(emoji)` computes `wanted` from `chips`, what the reader sees, not from the read: `undefined` when the shown chip of `emoji` is `mine`, else `emoji`. So a second tap before the read catches up works from the screen.
- `chips` is `withOwnEmoji(read(), wanted.emoji, name)` while `wanted` is set for this key and either a toggle is out or the read's own emoji differs from `wanted.emoji`; else `read()`. A `$derived`, so the template mutates nothing.
- On success `wanted.emoji` is set from the answer, not kept from the tap: `toggleReaction` answers whether the reader now holds the emoji (`reaction/writes.ts:7`), and the server toggles from the stored row (`reaction/edit.server.ts:231-236`), so a read that never showed an own emoji set on another device (no marker moves on an emoji) ends on what the server did. `true` keeps the tapped emoji, `false` sets `undefined`.
- An `$effect` drops `wanted` once no toggle is out and the read agrees, as `createSaveState` does; the `catch` drops it on a refusal; a new key ignores it.

`Reactions.svelte` and `CommentReactions.svelte` render `reaction.chips`. The reader's name is `toAuthor(user.id, user.username).name` from the global user, as the mapper names a reactor.

The `busy` guard stays: a second tap waits for the first answer (`reactions_one_emoji_idx`, the comment in `toggle.svelte.ts`).

Alternatives: a PowerSync twin of the toggle (a second module for logic both builds can share); dropping the Zero client body so the overlay is the one mechanism (production would lose the local write and show nothing after a reload until the row syncs, for a body Zero's retirement removes anyway).

### D3. A twin for the report reads

`src/lib/entities/report/resources.powersync.svelte.ts` exports `myOpenReport(kind, id)` and `myReportedIds(kind)` over `psResource((q) => q.from({ r: collections().content_reports }), ...)` on the `essentials` stream, rows through `toZeroRow('content_reports', row)`, then the same `find` and `filter` the Zero module runs. No `reporter_fk` filter: the stream holds the caller's own rows only (`streams.server.test.ts` pins its predicate), and an account switch reloads the document. `twins.ts` gains the `Fits` entry.

After a report is sent, its row reaches the device on the next sync, shortly after the write is answered. The report form leaves for the object's page on success, so the entry may read "Report" for that moment. Accepted; the drive measures it (task 4.2), and a visible gap of more than about a second goes to the user.

### D4. Where the code lives

Beside what it extends: the overlay function in `reaction/mapper.ts` next to `reactionChips`, the wanted state in `toggle.svelte.ts`, the twin beside `report/resources.svelte.ts`, the wiring in `engine.powersync.ts`. No new module beyond the twin.

## Risks / Trade-offs

- [Another member's emoji does not show while a thread or the feed is open] → shown on the next refetch; stated as a non-goal and in `CONTEXT.md`. R2 makes reactions local.
- [The read is stale on the reader's own emoji, set on another device: no marker moves on an emoji] → the tap's answer corrects `wanted` (D2), and `write()`'s refetch of every read brings the read to the server's state, which drops `wanted`. If another device of the reader changes the same target between this device's answer and its refetch, this bar keeps showing its own answer until the next tap or until it unmounts (no marker moves on an emoji); that next tap still lands right, since the server toggles from the stored row.
- [In the PowerSync build, a reload while a toggle is out, or before the read caught up, loses the overlay: it lives in memory] → the chip shows what the read holds until the refetch after load; a reload also aborts the POST in flight, as for every write there since 1177. The Zero build keeps its stand-in row across a reload. Accepted until offline writes; task 4.2 drives it.
- [Server load from threads] → at most two threads per screen, refetched within the same one-per-second throttle and hidden-tab hold as the event reads (1180 D1, D4).
- [The report row arrives late after sending] → D3; measured by drive.
- [The Zero build changes] → the overlay shows what the stand-in row shows, and `wanted` drops once the write is answered and the read agrees; driven on both builds (task 4.2).

## Migration Plan

Merge to `develop` with the change archived in the pull request's branch. No schema, stream or deploy step. Rollback: revert the merge.

## Open Questions

None.
