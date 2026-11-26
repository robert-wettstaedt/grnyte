# Proposal

## Why

Issue 1181, the notifications package of R1, the first release of the move from Zero to PowerSync (issue 1145, `openspec/changes/migrate-sync-to-powersync-milestone/roadmap.md`). Since 1177 the PowerSync build reads the inbox and the unread count from the app server, and marking as read goes through the write route. Both reads are fetched again only on open, after an own write, on return to the app and back online. A notification aimed at the member while the app is open (a reply, an invitation accepted, a removal notice) shows nowhere until then: not in the inbox, not on the bell, the tab dot or the installed app's badge. The account's change marker that would tell the device (`user_counters.notifications`, moved at commit when a notification of that account is inserted, deleted or changed beyond its push stamp) already syncs in the `essentials` stream, and nothing reads it. 1180 built the listener for the events marker; this change points the same listener at the account's marker.

Opening the inbox has a race of its own in the PowerSync build: the inbox's first read and the read mark are two independent requests, so when the mark commits first, every row arrives already read and none shows as new on that visit.

## What Changes

- In the PowerSync build, a move of the account's notifications marker fetches the notification reads on screen again: the inbox and the unread count, which feeds the bell, the dot on the feed tab and the installed app's badge. Event reads and every other read are not asked.
- A move while the app is hidden is held and delivered once when it is shown again (1180's listener does this for every marker).
- The inbox marks everything read once its first answer is in, instead of on mount, so the rows that were unread show as new on that visit in either build.
- Records: `CONTEXT.md` ("change marker" names the notification reads beside `listEvents`).

Nothing is client-breaking: no URL, remote function export, mutator, route or `manifest.id` changes. Production builds Zero; there the only change is when the inbox sends its read mark (after its first answer rather than on mount), which a tab loaded before the deploy does not notice.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `sync/server-reads`: the notification reads follow the account's change marker; opening the inbox shows what was unread and clears the count, in either build.

## Non-goals

- A local hold that drops the count before the server answers (design D2): no in-app surface that shows it is on screen while the inbox marks it read.
- Comments (1182) and starting no Zero client (1183).
- Updating the installed app's badge while the app is hidden: a push already carries the badge (`src/sw.ts`), and a move while hidden is delivered on return.
- Marking rows read as they arrive while the inbox stays open: the inbox marks once per visit in either build today.
- A local notifications window or stream (R2, the step after the PWA's switch, in the same roadmap).
- Any deployment of a PowerSync build.

## Impact

- Entity modules: none edited (`notification` reads and writes are reused as they are). Tables: none changed; `user_counters` is read on the device. Routes: `/notifications` (`+page.svelte`, when it marks). Remote functions: none.
- Sync: `state/engine.powersync.ts` (one line).
- Copy: none.
- 1182 runs in parallel and may also want the `user_counters` marker. `onMarkerMove` keeps one callback per table, so the two changes share one call and add their read names to its list; whichever merges second rebases onto that line.
- Size: 0.5 days, most of it the drive.
