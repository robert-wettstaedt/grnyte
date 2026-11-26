# Design

## Context

See proposal.md for why. Code facts (read 2026-11-26 at `60a29e67`):

- Every event screen reads one query definition, `listEvents` (`event/queries.ts:172`), through `eventList` (`event/resources.svelte.ts`): the feed (`eventFeed`, `event/feed.svelte.ts`) with a window (`upTo: seen`) and a "newer" read (`after: seen`, whose length is the pill's count), `EventLog` (an entity's log, `scope`), `EventMeta` (the "last edited" line, `limit: 1, scope`) and the event page (`ids`).
- In the PowerSync build that read is a server read: `source.powersync.svelte.ts` keeps one `ServerRead` per name and arguments in `live` while a screen shows it, and `refreshReads()` asks every one again. It is called after an own write (`write.powersync.ts`), on a stale return (`onStaleReturn` in `powersync/db.svelte.ts`, wired in `state/engine.powersync.ts`) and back online. A refresh coalesces: one request at a time per read, at most one more queued.
- `region_counters` (`nid`, `region_fk`, `events`) is in the client schema (`powersync/schema.ts:147`) and synced under `my_regions` in `region_activity`. The migration `0153` moves `events` once per committing transaction that inserted, changed or deleted an event of that region. Nothing on the client reads it.
- `feed.svelte.ts` imports `syncCaughtUp` from `$lib/zero/z.svelte`, its only use of the Zero client. In the PowerSync build that reads a barrier of the Zero client `start()` still starts ("for the feed's catch-up check alone"). `ZERO_CLIENT_IMPORTERS` is `engine.powersync.ts` and `feed.svelte.ts`; its test fails on a listed file that no longer imports the client.
- `source.svelte.ts` (Zero) already imports `getZ` from `./z.svelte`; `source` is a twin pair in `powersync/twins.ts`, so the PowerSync build swaps the whole module.
- PowerSync's `db.onChange({ onChange }, { tables, throttleMs })` calls back when a watched table changes, sync downloads included, and returns a dispose function.
- Marking the feed as seen: `acknowledge()` calls `markEventFeedSeen` (`notification/writes.ts`), which goes through `write()`. Since 1177 the PowerSync twin posts `notifications.markFeedSeen` to `/api/sync/mutate`; the server mutator runs `markEventFeedSeenRow` as the caller and only moves `user_settings.seen_up_to_event_at` forward. The client mutator's optimistic body never ran in the PowerSync build and nothing on the client reads the column. The server half is covered: 1177's task 1.7 ran every entity suite through the write route (`MUTATE_ROUTE=sync`), `notification/mutators.server.test.ts:95` included, with no difference. The client half (the feed's `acknowledge()` reaching that POST in the PowerSync build) was never driven.

## Goals / Non-Goals

**Goals:** the event screens of the PowerSync build follow other members' changes while open; `feed.svelte.ts` imports no Zero client; the Zero build behaves as `develop`; the pattern is one that 1181 and 1182 extend by a table and a list of read names.

**Non-Goals:** see the proposal. Design-level: no new table, stream, query definition, remote function or mutator; no per-region scoping of a refetch.

Reads and writes, as the config asks: every read here is the Zero query definition `listEvents`, a live Zero query in the Zero build and a server read through `readQuery` in the PowerSync build; the device-side read of `region_counters` is a PowerSync change listener, not a query a screen renders. The one write is the existing mutator `notifications.markFeedSeen`. No remote function changes.

## Decisions

### D1. The database tells one listener per marker table

`powersync/db.svelte.ts` gains `onMarkerMove(table, callback)`, kept in a map by table name with one callback each, as `onStaleReturn` keeps one slot: `start()` runs again on every token refresh. `initPowerSync` registers each entry on the database it opens with `db.onChange({ onChange }, { tables: [table], throttleMs: 1000 })` and disposes it when that database closes or is replaced (sign-out, account switch). An entry set after the database opened is registered at once.

The callback carries no value. A move is "something in these regions changed", and which marker moved does not decide anything here (D2). The first download of `region_counters` after open also calls back; the reads it asks again were just fetched, so that costs one extra read per screen at start and is accepted rather than tracked.

`throttleMs: 1000` bounds a busy region to one refetch round per second per device; a refetch already in flight absorbs further moves (one queued per read).

Alternatives: `db.watch` over `SELECT region_fk, events FROM region_counters` with a comparator (rows nobody reads, and a first emission to tell apart); polling the server (what the marker exists to avoid).

### D2. A marker refreshes the reads it names

`refreshReads(names?)` in `source.powersync.svelte.ts` takes an optional list of query names; with one, it asks only the live reads whose definition name is listed (`ServerRead` keeps the name `named()` already returns). Without one it stays as today, for an own write, a stale return and back online.

`engine.powersync.ts` wires `onMarkerMove('region_counters', () => refreshReads(['listEvents']))` beside `onStaleReturn(refreshReads)`. All event reads on screen are asked, in every region of the device: an event read's region is not part of its arguments (a scope or an id list implies it), and a screen shows one to three of them.

`db.svelte.ts` keeps importing nothing from the read seam, for the reason D8 of the write path gives (a remote module in its import chain breaks the browser tests that load it).

1181 adds `user_counters` with the notification read names; 1182 adds whatever comments are keyed on. Neither needs new plumbing.

Own writes: a write that records an event refreshes every read (D8 of the write path) and then moves the marker, which asks the event reads once more. One redundant read per own event-recording write, accepted (the 50-row read took a median of 38 ms in 1177's task 10.3).

### D3. Caught up comes through the read seam

`syncCaughtUp` is exported from `src/lib/zero/source.svelte.ts` (a re-export of the Zero client's function, so the Zero build is unchanged) and from its twin, where it answers `true`: a server read is answered by the server's current state, so an answered read is caught up, and the feed's latch already waits for `answered`. `feed.svelte.ts` imports it from `$lib/zero/source.svelte` and no longer from `$lib/zero/z.svelte`; the `Fits` entry for `source` in `twins.ts` holds the twin to the export, checked by svelte-check.

Consequence: in the PowerSync build, after a reconnect the feed shows its last rows without the "arriving" state until the refetch lands (back online refreshes every read, and a refetch keeps the rows `complete`). Zero shows "arriving" there because a reopened Zero query reports last session's rows as complete; a server read never does. Accepted; telling "a refetch is out" would need a reactive flag on every read for a state that lasts one request.

Alternative: a new twin pair for one function (a module and a `twins.ts` entry for what the existing pair carries).

### D4. A move while hidden is delivered on return

While `document.visibilityState` is `hidden`, the listener in `db.svelte.ts` records that its table moved instead of calling back; on the next `visible`, `watchVisibility` calls back once per recorded table, unless the return is stale, whose `staleReturn` already asks every read. So a backgrounded tab asks the server nothing for others' activity, and a short look away still comes back current.

Alternative: refetch while hidden (every hidden tab of every member re-asks the feed per move; browsers throttle timers in hidden tabs but not the sync's socket).

### D5. Marking the feed as seen

No production code changes for it: `acknowledge()` already reaches the write route. The server half is already tested through the write route (Context); this change adds the missing client half by drive (task 4.2 (b)): the POST from the feed and the stored watermark, and no move for a filtered feed. No new unit test: the link is `acknowledge()` calling an existing write function, and a test of it would fake both ends. The marker does not move on it (`user_settings` has no trigger), so a seen mark causes no event refetch beyond the own-write refresh.

### D6. The guard list

`'src/lib/entities/event/feed.svelte.ts'` leaves `ZERO_CLIENT_IMPORTERS`. `engine.powersync.ts` stays listed until 1183; its comment that Zero is started "for the feed's catch-up check alone" is corrected to say nothing in this build reads it.

### D7. Where the code lives

Beside what it extends: the listener in `powersync/db.svelte.ts` (which owns the database lifecycle), the filter in `zero/source.powersync.svelte.ts`, the wiring in `state/engine.powersync.ts`. No new module.

## Risks / Trade-offs

- [`onChange` does not fire for rows the sync downloads into a view] → task 2.1 tests the listener against the fake, and task 4.2 drives it: a `psql` update of the region's events marker on the dev database must make the open feed ask `listEvents` within two seconds. A miss stops the change and goes to the user (fallback: `db.watch` over the marker rows).
- [Server load: every open feed re-asks per move] → at most one round per second per device (D1), nothing while hidden (D4), one request per read in flight. A 2,000-member region where everyone has the feed open and someone logs an ascent every second would make each device ask about once a second; measured cost per read is under 40 ms. Revisit if the app server's read latency climbs.
- [A refetch replaces a window the reader is scrolling] → the window keeps `upTo: seen`, so only edits and deletions of rows already shown change it; new rows go to the pill.
- [A move during the first load answers a half-built window] → the refetch coalesces into the request in flight (one queued), and the phase only latches on an answer.
- [The Zero build changes] → one import path in `feed.svelte.ts` to a module that re-exports the same function; driven on both builds (task 4.2).

## Migration Plan

Merge to `develop` with the change archived in the pull request's branch. No schema, stream or deploy step: the marker and its stream entry shipped with 1177. Rollback: revert the merge.

## Open Questions

None.
