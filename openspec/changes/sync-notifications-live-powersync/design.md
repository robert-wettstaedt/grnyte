# Design

## Context

See proposal.md for why. Code facts (read 2026-11-26 at `80b2f692`):

- Two query definitions back every notification surface (`notification/queries.ts`): `listNotifications`, the inbox (`notificationList`, `routes/(app)/notifications/+page.svelte`), and `countUnreadNotifications`, the unread rows capped at `UNREAD_CAP + 1` (`unreadNotificationList`). The second is read once, app-wide, in `state/global.svelte.ts` (`unreadNotifications`, `undefined` until answered); the bell (`EventFilters.svelte`, the feed page), the tab dot (`TabBar.svelte`, `NavRail.svelte`, both under `(shell)`) and the installed app's badge (`setAppBadge` in `routes/(app)/+layout.svelte`) all read that one number.
- In the PowerSync build both are server reads (`source.powersync.svelte.ts`). `refreshReads(names?)` asks the live reads again, all of them or those named (1180 D2); `names` is typed as registry query names, so a misspelt name fails svelte-check.
- `onMarkerMove(table, callback)` (`powersync/db.svelte.ts:186`, 1180 D1) keeps one callback per table in `markerListeners`, registers `db.onChange` with `throttleMs: 1000` per table, holds a move while hidden and delivers it once on a non-stale return (1180 D4). `engine.powersync.ts:98` wires only `region_counters`.
- `user_counters` (`auth_user_fk`, `notifications`) is in the client schema (`powersync/schema.ts:246`) and synced to the account alone in the `essentials` stream (`deployment/powersync/sync-config.yaml:28`, priority 0). Migration `0153` moves it once per committing transaction that inserted or deleted a notification of that account, or changed one other than its `pushed_at` stamp. Marking as read sets `read_at`, so it moves the marker too.
- Opening the inbox calls `markNotificationsRead` once in `onMount` (`+page.svelte:70`). In the PowerSync build that is one POST of `notifications.markRead` to `/api/sync/mutate`, after which `write()` calls `refreshReads()` (`write.powersync.ts:50`). The Zero client mutator's optimistic body never runs there. The inbox draws each row's unread mark from `arrivedUnread` (`+page.svelte:41-63`), the ids it has seen with `readAt` null. In the PowerSync build the inbox's first `listNotifications` request starts in a microtask when the screen subscribes (`source.powersync.svelte.ts:62`) and the `markRead` POST starts in `onMount`: two independent requests, so when the mark commits first, every row arrives read and `arrivedUnread` stays empty.
- Every in-app surface that shows the unread count sits under `(shell)`; `/notifications` is outside it, so none is on screen while the inbox is open. The tab dot shows only on the feed tab while another tab is active (`TabBar.svelte:29`, `NavRail.svelte:44`); on the feed itself the bell shows the count. The OS badge effect lives in `routes/(app)/+layout.svelte:67-84`, mounted under the inbox too.
- 1179 (`finish-sync-writes`, not merged yet) leaves read marks to this change (its design's Context, user 2026-11-26). 1182 has not written its plan yet.

## Goals / Non-Goals

**Goals:** the inbox and the unread count of the PowerSync build follow notifications aimed at the member while the app is open; opening the inbox shows what was unread as new and clears the count before the member sees it in the app again; the Zero build behaves as `develop` apart from when the inbox sends its mark (D3), which stays at once from local rows.

**Non-Goals:** see the proposal. Design-level: no new table, stream, query definition, remote function, mutator, module or copy.

Reads and writes, as the config asks: both reads are the Zero query definitions `listNotifications` and `countUnreadNotifications`, live Zero queries in the Zero build and server reads through `readQuery` in the PowerSync build; the device-side read of `user_counters` is 1180's change listener. The one write is the existing mutator `notifications.markRead`. No remote function changes.

## Decisions

### D1. The account's marker refreshes the notification reads

`engine.powersync.ts`, beside the `region_counters` line:

```ts
onMarkerMove('user_counters', () => refreshReads(['countUnreadNotifications', 'listNotifications']))
```

Nothing else is new: the throttle, the hidden hold and the dispose on sign-out or account switch come from 1180's listener, which is per table. The sync config hands each device only its own account's row, so a move is always the member's own.

The first download of `user_counters` after open calls back once, as 1180 accepted for `region_counters`: one extra read of each notification read on screen at start.

Own writes: marking as read refreshes every read (1177 D8 of the write path) and then moves the marker, which asks the two notification reads once more. Accepted, as in 1180 D2.

One callback per table: if 1182 needs the `user_counters` marker too, it adds its read names to this call's list rather than calling `onMarkerMove('user_counters', ...)` a second time, which would replace this one. The proposal's Impact says so, and the 1182 session is told.

Alternative: a second marker table for the badge alone (a schema change for what one list of names covers).

### D2. Marking as read needs no local hold

The issue asks that marking as read shows at once. In the Zero build the client mutator clears the rows locally. In the PowerSync build the count drops when the POST has answered and the refreshed `countUnreadNotifications` lands: one write and one read, each a single request (1177 measured the much heavier 50-row `listEvents` read at a median of 38 ms, task 10.3). No in-app surface that shows the count is on screen meanwhile (Context), and the inbox's rows keep their unread marks (`arrivedUnread`, with D3). So the reader sees the old count in the app only if they leave the inbox before the round trip ends; the drive (task 2.1 (c)) checks the count is gone on the way back. The installed app's badge may show the old count for that round trip on a desktop, where the dock stays visible; accepted.

Alternative: a hold in `notification/resources.svelte.ts` that hides the rows the count held when the inbox was opened until the server agrees, reverted on a failed write. Rejected for now: module state and a revert path in both builds for a window no in-app screen shows. If the drive finds the old count on the way back, this is the fallback, and the change goes back to the user before it is built.

### D3. The inbox marks once its rows are on screen, or on leaving

`routes/(app)/notifications/+page.svelte` sends `markNotificationsRead` once per visit, at the first of two moments instead of from `onMount`: the inbox's rows are on screen (`notifications.phase.kind` is `answered` or `arriving`, from an effect below the one that fills `arrivedUnread`), or the page unmounts without having marked (the effect's teardown). A local `marked` flag keeps it to one.

Why both builds take it unchanged:

- PowerSync build: a server read sets its rows and its answer in one step (`ServerRead`, `source.powersync.svelte.ts:135-136`), so its first rows are the server's answer. The mark goes out after `arrivedUnread` has the unread ids, which removes the race in Context.
- Zero build: rows from the local store are `arriving` (`answered` waits for zero-cache to confirm, `resource.svelte.ts:59`, `:319`), so the mark goes out on the first flush that shows them, as `onMount` did in effect; the client mutator then applies optimistically, as before. With nothing local, the mark waits for zero-cache's rows; one that does not come before the reader leaves is sent on leaving.
- A visit that leaves before any row is shown still marks, on leaving, in either build; the rows the reader never saw are marked as `onMount` marked them. Offline, `write()` refuses and `reportIfOnline` stays silent, as today.

Alternative: gate on `answered` alone (in the Zero build the mark would wait for zero-cache's confirmation of the ten-tree inbox query, and a quick visit would send none). Alternative: keep `onMount` and have the server read wait for the write (an ordering across two independent requests that nothing else needs).

### D4. Where the code lives

One line in `state/engine.powersync.ts`, one effect (with its teardown) in `routes/(app)/notifications/+page.svelte`, and the `CONTEXT.md` entry. No unit test for the line: it passes two existing, tested functions to each other (1180 tasks 1.1, 2.1, 2.2), its names are checked by svelte-check, and a test of it would fake both ends. The mark is test-driven at the page (user, 2026-11-26): `+page.svelte.test.ts` renders the inbox with its entity edges faked (the inbox resource's rows and phase, `syncCaughtUp`, the user row, `markNotificationsRead` as the observer) and checks the rows shown as new and the marks sent; the drive still checks the order of the two real requests (task 2.1 (c)).

## Risks / Trade-offs

- [The dev PowerSync service runs an old stream config without `user_counters`] → it reads its config only at start from the checkout that last ran its compose (1180 task 4.2). Task 2.1 first checks a `user_counters` row reaches the device through the `essentials` stream (the listener's first call asks both reads), and points the service at this worktree's config if not, back afterwards.
- [A notification for a member with the inbox open stays unread on the server] → it arrives after the visit's one mark (D3), so the next visit marks it. Same in the Zero build.
- [Server load] → the account's marker moves only for that one account, far less often than a region's events marker; the same throttle and hidden hold apply.
- [The Zero build changes] → only when the inbox sends its mark (D3); `engine.powersync.ts` is the PowerSync build's twin. Driven on both builds (task 2.1).

## Migration Plan

Merge to `develop` with the change archived in the pull request's branch. No schema, stream or deploy step: the marker and its stream entry shipped with 1177. Rollback: revert the merge.

## Open Questions

None.
