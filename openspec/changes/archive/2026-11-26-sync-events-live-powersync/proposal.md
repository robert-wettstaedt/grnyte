# Proposal

## Why

Issue 1180, the events package of R1 (issue 1145). Since 1177 the PowerSync build reads the feed, the entity log, the "last edited" line and the event page from the app server, but only on open, after an own write and on return to the app. Another member's ascent or edit shows nowhere until then, so the "N new" pill never appears while the feed is open. The change marker that would tell the device (`region_counters.events`, moved at commit by `touch_marker` / `flush_markers`) already syncs in `region_activity`, and nothing reads it. The feed also still imports the Zero client for one function, `syncCaughtUp`, which keeps a Zero client in the PowerSync build and keeps `feed.svelte.ts` on the guard's list.

## What Changes

- In the PowerSync build, a move of a region's events marker fetches every event read on screen again: the feed's window and its "newer" read (so the pill counts what arrived), an entity's log, the "last edited" line and the event page. Reads of other kinds are not asked.
- A move while the tab is hidden is held and delivered once when it is shown again.
- The feed's caught-up check comes through the read seam instead of the Zero client: the Zero build keeps Zero's sync barrier, the PowerSync build counts a server answer as caught up.
- `feed.svelte.ts` stops importing the Zero client, and its entry leaves `ZERO_CLIENT_IMPORTERS` in `vite.sync-engine.ts`.
- Marking the feed as seen is driven in the PowerSync build (the feed already posts `notifications.markFeedSeen` to `/api/sync/mutate` since 1177, and the server side was tested there; the feed's side never was).
- Records: `CONTEXT.md` ("change marker", "server read" and the zero-cache entry say what is true after this change).

Nothing is client-breaking: no URL, remote function export, mutator, route or `manifest.id` changes. Production builds Zero, whose code path is unchanged apart from one import moving to a module that re-exports the same function, so a tab loaded before the deploy keeps working.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `sync/server-reads`: a server read is also fetched again when its change marker moves; the feed's pill and its seen mark work in the PowerSync build.

## Non-goals

- The inbox, the unread badge and `user_counters` (issue 1181), comments (1182). They reuse the pattern set here and add their own table and read names.
- Starting no Zero client in the PowerSync build (1183). After this change nothing in that build reads the Zero client it still starts.
- A local events window or any events stream (R2, the roadmap step after the PWA cutover, `migrate-sync-to-powersync-milestone/roadmap.md`).
- Emoji reactions on feed cards following other members live: `reactions` has no marker trigger, so they show on the next refetch (any event move, own write or return). Live reactions are R2's. Comment counts do follow, because a comment updates `events.comment_count` and so moves the marker.
- Narrowing a refetch to the region whose marker moved: every event read on screen is asked.
- Showing the "arriving" state while a refetch after reconnecting is in flight in the PowerSync build (design D3).
- Any deployment of a PowerSync build.

## Impact

- Entity modules: `event` (`feed.svelte.ts` only). Tables: none changed; `region_counters` is read on the device. Routes: none. Remote functions: none.
- Sync: `zero/source.svelte.ts`, `zero/source.powersync.svelte.ts`, `powersync/db.svelte.ts`, `state/engine.powersync.ts`, `vite.sync-engine.ts`.
- Copy: none.
- `source.powersync.svelte.ts` and `engine.powersync.ts` are touched by 1181 and 1182 after this; 1179 is planned in parallel on toggle writes and CI; its file list was not written when this was, so whichever merges second rebases over any overlap in `source.powersync.svelte.ts` or `engine.powersync.ts`.
- Size: 1 to 1.5 days.
