# Proposal

## Why

R1 (issue 1145) makes the PowerSync build read and write without Zero, so the PWA can switch engines (milestone design D17). Today that build still starts a Zero client for every write and for the feed, the inbox, comments and reports. R1 lands as seven packages (issues 1177 to 1183), one pull request each; this is the first (issue 1177). It builds what the other six stand on: a write path that does not pass through zero-cache, a read path for what the device does not hold, the tables and stream entries the later packages need, and a guard that keeps new uses of the Zero client out of the PowerSync build.

## What Changes

- A write route on the app server, `POST /api/sync/mutate`. One request names a mutator, its arguments and a write id the client made, and the app server runs the existing server mutator in one transaction. The write id is recorded with the write, so the same write sent twice applies once and the second request gets the first answer. `/api/zero/mutate` stays as it is, for zero-cache.
- In the PowerSync build, `write()` sends every write to that route instead of to the Zero client. All 65 mutators switch together, because they share that one function. A failed send is retried twice with the same write id before the client reports the failure.
- A read path for data the device does not hold. In the PowerSync build a resource without a PowerSync twin reads through the app server, which runs the query definition zero-cache would run, for the same caller. From this change on that covers events (feed, entity log, the "last edited" line, the event page), notifications, comments and own reports. They load on open, after an own write and on return to the app. They do not update live; the later packages add that.
- Three tables: `applied_writes` (the write ids), and `region_counters` and `user_counters`, change markers that database triggers keep and that the events and notifications packages will use to refresh.
- Stream entries: `region_counters`, `user_counters` and the caller's own open `content_reports` join the PowerSync streams. Nothing reads them yet.
- A guard: a PowerSync build fails when a module outside a recorded list imports the Zero client. The list holds the five modules that still do after this change, and each later package deletes its own entries.
- CI builds the app with the PowerSync engine as well.
- The privacy page names the new record and its 30 days.
- Records: `CONTEXT.md`, `AGENTS.md`, and the milestone's `roadmap.md` and `design.md`, which this change corrects (the write route runs mutators directly, the server reads run the query definitions, R1's size).
- Nothing here is client-breaking. The change only adds: a route, a remote function, tables. Production builds Zero and calls none of it, and a tab loaded before the deploy keeps working as it did. The three new tables change Zero's generated schema, so a device that loads the new build re-syncs its local store once, as after every schema change.
- The remote write functions the mutators replaced were deleted first, in a pull request of their own (issue 1184, merged 2026-11-25; this change's design D15).

## Capabilities

### New Capabilities

- `sync/write-path`: how a write reaches the app server without the sync engine carrying it, and what holds when the same write is sent more than once.
- `sync/server-reads`: how a client reads data its device does not hold, and which rules decide what it gets.

### Modified Capabilities

- `sync/engine-switch`: the requirement about the PowerSync preview changes (its writes go to the write route, and it stays undeployed until it runs without a Zero client); a PowerSync build gains a guard against new uses of the Zero client; CI builds both engines.
- `sync/mutations`: the requirement that a write needs a signed-in session keeps pending writes through a sign-in only where Zero carries them; a PowerSync build has no write queue and reports the write as failed.

## Non-goals

- Live updates of the feed, the inbox and comments in the PowerSync build: the events, notifications and comments packages (issues 1180 to 1182) read the change markers this change adds.
- The instant feel of toggles that Zero applied locally (reactions, read marks, file visibility, user settings): the writes and comments packages (1179, 1182). Until then they change when the server answers.
- The connection state, sign-in recovery and the second-tab message without Zero: the shell package (1178). The PowerSync build still starts a Zero client after this change; stopping that is the last package (1183).
- A PowerSync twin for own open reports: the comments package reads the synced copy this change starts sending.
- Offline writes, PowerSync's upload queue and device-made ids: issue 1148.
- A separate route for the native app: decided with the Expo work. The route assumes no browser.
- Drizzle versions of the server reads: R2 makes the feed, the inbox and comments local, and R3 writes what stays on the server in Drizzle before Zero's library goes.
- Any deployment of a PowerSync build, and Playwright in CI.

## Impact

- Routes: new `src/routes/api/sync/mutate/+server.ts`; `src/routes/api/tasks/cleanup/+server.ts` gains one sweep; `privacy.en.html` and `privacy.de.html` gain one list item.
- Remote functions: new `readQuery` in `src/lib/zero/read.remote.ts`. No existing export moves or changes.
- Tables: new `applied_writes`, `region_counters`, `user_counters`; triggers on `events` and `notifications`; the `powersync` publication gains `content_reports`, `region_counters` and `user_counters`. zero-cache replicates the three new tables as well, since its publication covers every table in `public`.
- Entity modules: `area`, `block` and `route` import `waitForRow` from its new module, and `file/upload.ts` shares its id fallback; no other changes its code. `favorite` gains a server test; `event`, `notification`, `reaction` and `report` read through the new source in the PowerSync build without an edit.
- Sync code: `src/lib/zero/` (`write.powersync.ts`, `ttlSource.svelte.ts` renamed `source.svelte.ts` with one twin, `resource.svelte.ts`, `waitForRow.ts`, `read.remote.ts`, `server/syncMutate.server.ts`, `server/mutate.server.ts`), `src/lib/hooks/auth.server.ts`, `src/lib/state/engine.powersync.ts`, `src/lib/powersync/twins.ts`, `src/lib/powersync/db.svelte.ts` (one callback on return), `src/lib/forms/randomId.ts`, `src/lib/zero/permissions.ts`, the generated `src/lib/powersync/schema.ts` and `src/lib/zero/zero-schema.gen.ts`.
- Build and CI: `vite.sync-engine.ts`, `vite.config.ts`, `.github/workflows/ci.yml`.
- Deploy: the migration is additive and runs with the app as usual, zero-cache first. The stream config deploys separately through the VPS workflow; the PowerSync service reprocesses for 20 to 90 seconds, and no production client reads from it yet.
- Size: 2.5 to 3 days.
