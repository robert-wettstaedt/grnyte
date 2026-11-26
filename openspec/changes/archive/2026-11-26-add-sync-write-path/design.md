# Design

## Context

See proposal.md for why. The code facts the design rests on (read 2026-11-24 and 25):

- Writes: 65 Zero custom mutators in 14 entity modules. Every one reaches the server through one client function, `write()` (`src/lib/zero/write.ts`), which the 14 `writes.ts` files, `forms/store.svelte.ts` and `forms/command.ts` import. It refuses offline, awaits Zero's server answer and maps a refusal to a `WriteRejection`. Six client mutator bodies also apply locally at once (`reaction.toggle`, `favorite.set`, `file.setVisibility`, `notification.markFeedSeen`, `notification.markRead`, `user.updateSettings`); only favorites has a PowerSync overlay (`favorite/save.powersync.svelte.ts`).
- `/api/zero/mutate` is Zero's push processor (`src/lib/zero/server/mutate.server.ts`). It needs a client group, a client id and strictly sequential mutation ids, and a replayed mutation answers `alreadyProcessed` without its result. Its replay tables (`zero_0.clients`, `zero_0.mutations`) belong to zero-cache.
- Zero documents a plain route over the mutator registry ("REST", zero.rocicorp.dev/docs/rest): look the mutator up with `mustGetMutator` and run it in `dbProvider.transaction`. `mutate.server.ts:17` already builds that provider (`zeroDrizzle(schema, db)`).
- Reads: four `resources.svelte.ts` modules have no PowerSync twin (`event`, `notification`, `reaction`, `report`) and read through Zero in the PowerSync build (comments live in `reaction`). Each calls `createResource` (`src/lib/zero/resource.svelte.ts`), which takes its rows from a `QuerySource`; the default one asks the Zero client, and `ttlSource.svelte.ts` is a second implementation. The class around it decides the phase (loading, answered, unavailable offline) from the source's `data`, `details.type` and `view`.
- Zero documents running a query definition on the server ("ZQL on the Server", zero.rocicorp.dev/docs/server-zql). `src/lib/zero/tenancy.test.ts` and `src/lib/entities/event/queries.test.ts` already run the real definitions that way, and `/api/zero/get-queries` shows the context a definition needs: `{ authUserId, pageState }`. A definition run without memberships is unfiltered, which is why `zeroCaller` refuses that case.
- No server list read exists for events, notifications or comments. The push digest is a flat select, not a reusable tree, so the roadmap's "the drizzle tree the push digest uses" does not exist.
- Hooks: `/api/zero/` and `/api/app/` are header-authenticated, so no hook reads or refreshes a cookie session there (`isHeaderAuthenticated`, `src/lib/hooks/auth.server.ts`). Only `/api/zero/` skips the rate limit.
- The Zero client module `src/lib/zero/z.svelte.ts` is imported outside tests by `state/engine.ts`, `state/engine.powersync.ts`, `state/global.svelte.ts`, `components/StatusBar/StatusBar.svelte`, `zero/ttlSource.svelte.ts`, `zero/resource.svelte.ts`, `zero/write.ts`, `entities/event/feed.svelte.ts` and `routes/(app)/+layout.svelte`. Nothing guards a PowerSync build against it, and CI builds only Zero.
- Triggers in this repo are hand-written SQL in a migration, `SECURITY DEFINER` with a pinned search path (`drizzle/0115_comment_count_trigger.sql`), because handlers run under row-level security and other writers bypass them.
- `content_reports` holds open reports only (closing one deletes the row); the reporter is `reporter_fk`, an app user id. The PowerSync publication lists its tables by name and is created by hand (`deployment/docker-compose.powersync.local.yml`); zero-cache's covers every table in `public`.

Decided with the user on 2026-11-24 and 25, and binding here: the route runs the mutator registry directly, not Zero's processor; "without Zero" means no Zero client, while Zero code that needs no client stays until R3; the write ids live in a Postgres table for 30 days; the feed's and the inbox's change markers are small synced rows; own open reports sync in `essentials`; the server reads run the Zero query definitions; R1 is seven packages (issues 1177 to 1183) with this one first, after the groundwork of issue 1184.

## Goals / Non-Goals

**Goals:**

- After this change, the PowerSync build sends no write and no read through the Zero client. The client stays only for what the shell and events packages still take from it.
- One place per seam: one function for writes, one data source for reads the device does not hold, so the six later packages add behaviour, not plumbing.
- The Zero build behaves as `develop`. Its hand-written code changes are moves: `defaultSource` into a renamed module and `waitForRow` into a module of its own (D6), and the caller and context block of `handleMutate` into an exported function beside an exported provider (D1), and `file/upload.ts`'s id fallback into a shared helper (D5). Its generated `zero-schema.gen.ts` gains three tables, as every table in `schema.ts` does; that changes Zero's schema version, so each device re-syncs once after the deploy (Migration Plan).
- Fewer parts than the first draft of this plan, not more (D15).

**Non-Goals:**

- See proposal Non-goals. Design-level: no second copy of a query definition, no hand-made stand-in for Zero's transaction, no new error format.

## Decisions

### D1. The route runs the mutator in Zero's own server transaction, without the push protocol

`src/routes/api/sync/mutate/+server.ts` is five lines over `handleSyncMutate(request)` in `src/lib/zero/server/syncMutate.server.ts`, beside `mutate.server.ts`. It takes the caller and the `ServerMutatorContext` from one function that `mutate.server.ts` exports and `handleMutate` uses too (the block that stands in `handleMutate` today), and runs `mustGetMutator(serverMutators, name).fn({ args, ctx, tx })` (after `isMutator`, because a namespace or an inherited name such as `areas` or `toString` is found too) inside `dbProvider.transaction(...)`, the provider `mutate.server.ts` already builds and now exports. Deferred work drains after the commit through `drainAfterCommit`, and only when the mutator succeeded.

The mutator therefore gets the transaction class it gets today: `asCaller` and `asPrivileged` find `tx.location` and `tx.dbTransaction.wrappedTransaction` unchanged. One thing is not there: `tx.retryOn` throws, because the loop that runs a mutator again belongs to the push processor. No production mutator calls it (only `mutate.server.test.ts` does); one that ever needs it needs a loop in this route first.

Alternatives: a second route over `handleMutateRequest`, with the browser acting as a Zero client (sequential ids per client, a replayed create without its id, bookkeeping in tables zero-cache owns); a bare drizzle transaction with a stand-in object for Zero's (works today, breaks silently if a mutator ever reads more of the transaction).

Body: `{ id, name, args }`, validated with zod: `id` a non-empty string of at most 64 characters (an opaque key, unguessable, because the table is keyed on it alone: a queue that numbers its writes needs the key `(auth_user_fk, id)` first), `name` a registered mutator, `args` whatever the mutator's own validator accepts. This is the piece the roadmap put in R2 ("new mutate implementation"); it moves here, and milestone design D8 (one shared handler) is superseded.

### D2. The write id is claimed first and filled last, in the write's transaction

New table `applied_writes`: `id text primary key` (the write id), `auth_user_fk uuid not null` referencing the auth user with `on delete cascade`, `name text not null`, `result jsonb`, `created_at`. Row-level security on, no policies: only the route writes it, on the login role, as `spent_challenges` is written.

Inside the transaction, first the pinned search path (`PINNED_SEARCH_PATH`; `asCaller` pins it only later, and an unqualified insert on a bare pooled connection is the 42P01 outage), then, before the mutator: `insert ... on conflict (id) do nothing`. If a row came back, the write is new: run the mutator, then store its result on the row. If none came back, read the row: same caller and same name answers the stored result without running anything; anything else is refused with 409 and no detail. The insert runs before `asCaller` switches role, the update after the mutator, when `run()` has set the role back.

Two copies in flight: the second insert waits on the first transaction's uncommitted row. If the first commits, the second finds the row and answers its result; if it rolls back, the second runs. A refused mutator rolls the transaction back, so its id is not kept and a replay is judged again.

Alternatives: storing the id after the write (two copies could both run); Zero's own tables (D1); device-made row ids (rejected: serial ids stay, milestone design D11; they also do not make an event or a toggle repeatable).

No backfill: the table starts empty.

### D3. Answers use HTTP status and the remote-command error shape

Success: `200 { "data": <the mutator's return> }`. A refusal: the status the mutator named (`details.status`) or 400, with `{ "message", "field" }`, the body `WriteRejection` already mirrors from a rejected remote command. The route adds no scrubber of its own: `run()` in `serverMutator.server.ts` already turns every failure that is not a refusal into `error_server_title`, and anything thrown outside a mutator is Kit's 500. 401: no valid token or no live session. 409: a write id recorded for another caller or mutator. 400: malformed body, unknown mutator, or arguments the mutator's own validator refuses (it throws `InputValidationError`, not a refusal; as a 500 the client would send it three times before it reports the failure), with `error_server_title`.

Alternative: Zero's envelope (always 200, the error inside). Rejected: a plain client would have to parse two layers, and the forms already read the other shape.

### D4. The route is header-authenticated: cookie-blind and rate-limited

`SYNC_API_PREFIX = '/api/sync/'` joins `isHeaderAuthenticated` in `src/lib/hooks/auth.server.ts`, so no hook loads or refreshes a cookie session for it and `locals` are anonymous; the handler verifies the Bearer token itself. It is not added to the rate limit's exemption (that exists because zero-cache is one address) and not to `CROSS_SITE_EXEMPT`: the client's own request is same-origin, and a cross-site request with a cookie is refused by the guard as today. The client sends `credentials: 'omit'`.

Fails if several heavy users behind one address pass 500 requests in 15 minutes. Then the limit is keyed on the verified user in the handler, as the comment in `rate-limit.server.ts` already proposes.

### D5. `write()` gets a twin, and all mutators switch together

`src/lib/zero/write.powersync.ts` is the twin of `write.ts`: the same `write`, `WriteRejection` and `offlineRejection`, plus `setWriteToken(getSession, userId)`, where `getSession` answers the current session's token and user id and `userId` is the started account. It reads the mutator's name and arguments off the request object the client registry builds (`mutation.mutator.mutatorName`, `mutation.args`), so no `writes.ts` and no mutator changes, and the client registry stays in the bundle as the list of names (Zero code that needs no client, kept until R3). It makes the id with `crypto.randomUUID()`, with the fallback `file/upload.ts` already has for an insecure origin (`randomFileName`, extracted to new `src/lib/forms/randomId.ts`), and posts to `/api/sync/mutate`.

- Offline (`isOnline()`): refuse before sending, as today.
- Network failure or a 5xx: retry after 0.3 s and after 1 s with the same id, then throw `offlineRejection`, or the general failure message while `isOnline()` is true: there only the app server failed, and `Form` hides itself on the offline flag until the device's state changes (found by the drive; message: user 2026-11-25). The write id is what makes this safe.
- 401: fetch the token again once (supabase-js refreshes an expired one) and retry; a second 401 throws the general failure message. The write is then dropped, not kept for after the next sign-in as Zero's client keeps it: there is no queue (issue 1148), and the `sync/mutations` delta says so (user 2026-11-25).
- The token must belong to the account the session was started for (`start()`), at the first send and at each resend: the getter reads storage every tab shares, and until `start()` has seen a switch a tab would otherwise write as the next account. A token of another account throws the general failure message and sends nothing.
- Any other 4xx: throw a `WriteRejection` with the message and field, scrubbed as `write.ts` scrubs.

The token source is the session read `state/engine.powersync.ts` already makes for PowerSync; `start()` passes it to `setWriteToken` as well. `start()` given another account than the one this document started takes another path and returns at once, before `setWriteToken` and `initPowerSync`: it deletes the first account's store (`dropAccount` in `db.svelte.ts`, new for this: cleared rows stay readable in the file's freed pages, found by the drive; a bare reload would skip the clearing `initPowerSync` does on a switch and leave the guidebook on a shared device), waits for that for at most 3 seconds as `wipeAndLeave` does, and reloads. Not `wipeAndLeave` itself: that deletes every account's store, the new one open in another tab included. A null session is no switch and does not change which account this document started. The reason for the path: `start()` runs again without a reload whenever the auth event carries a new token, and a form mounted for one account would otherwise submit as the next. These are this change's edits to a file the shell package also edits, so the shell package starts after this one merges or rebases over that line.

Every write in the PowerSync build takes this path once the twin exists. The five instant toggles without an overlay answer when the server does until the writes and comments packages add theirs; that build is a local preview (accepted, user 2026-11-25).

### D6. The data source is the read seam

`createResource` already takes its rows from a `QuerySource`. Zero has two: the default one, a constant inside `resource.svelte.ts`, and `ttlSource.svelte.ts`. They become one module: `ttlSource.svelte.ts` is renamed `src/lib/zero/source.svelte.ts` and also exports `defaultSource`, the constant moved out of `resource.svelte.ts` unchanged. `waitForRow`, the other use of the Zero client in that file, moves to `src/lib/zero/waitForRow.ts`; only the Zero `resources.svelte.ts` of `area`, `block` and `route` import it, and their PowerSync twins never did. Its one twin, `source.powersync.svelte.ts`, exports both names over the app server; a time-to-live means nothing for a fetch. `resource.svelte.ts` then imports no Zero client.

So in the PowerSync build every resource without a PowerSync twin becomes a server read with no edit to its entity module, and keeps the phases, the offline policy and the pill it has today, because the `Resource` class is the same. Reads: guidebook, profiles and search stay PowerSync reads (their twins); events, notifications, comments and reports are Zero queries in the Zero build and server reads in the PowerSync build; nothing here adds a Zero query.

The server source is written as Zero's `ttlSource` is: `createQuery(request, enabled)` returns reactive `data` and `details`, with the first value taken from the definition's own format. The context a definition needs for that (`{ authUserId }`) comes from the session `start()` hands over beside the write token. It reads through one remote function, `readQuery({ as, name, args })` in `src/lib/zero/read.remote.ts`, so identical reads on a screen share one request. `details.type` is `unknown` until the answer, then `complete`, or `error`. `view` is one stable object per request (name plus arguments); nothing is keyed on the account, because a switch reloads the document (D5). The view matters because the `Resource` class latches "answered" per view, so a new request must bring a new one or an old answer would vouch for it.

A request that differs from a live one only in `limit` or `upTo` (the feed's mark, "load older", "load earlier") starts with that request's rows and `details` `unknown`, so the list stays on screen as arriving, as it does with Zero, and is never answered by them. Any other change (a filter, an entity, `after`) starts empty: those rows answer another question. A disabled resource shows no rows, whatever a live request with the same arguments holds (the feed's `incoming` starts disabled with the arguments of its first window).

A failed fetch is an `error` only while the request has no answer, no rows carried over, and the device is online. With rows carried over it stays `unknown` and, after a network failure or a 5xx, is fetched again every 5 seconds while online; after a refusal (any 4xx) it keeps its rows and waits for the next refresh (D8). Offline it stays `unknown`, which the phase shows as unavailable. A failed refetch keeps the last answer and stays `complete`: `resolvePhase` puts an error before everything else, so the rows would be replaced by it.

Alternatives: a twin per entity module calling its own remote function (four modules of plumbing, and each would re-create the phase rules); extending `remoteResource` (it has no offline policy and no latch).

### D7. The app server runs the definition as the caller

The body of `readQuery({ as, name, args })` in `src/lib/zero/read.remote.ts`, with no server module beside it: `requireAuthed` and `requireLiveSession` for the claims and `userRegions` and `userPermissions` from `getRequestEvent().locals`, as `run()` in `authed.server.ts` takes them. Memberships that could not be loaded leave `backendUnavailable` on `locals`, which `requireAuthed` refuses with 503; a signed-in caller whose `userRegions` is missing is refused with 500, as `zeroCaller` does. The request also carries the account the screen belongs to, `as`; a cookie session of another account is refused with 409, because the cookie is shared by every tab. Then `dbProvider.transaction`: `applyRls` on the wrapped transaction, and `tx.run(mustGetQuery(queries, name).fn({ args, ctx }))`. A transaction, not the bare `run()`, so the pinned search path and the role apply; with a transaction-local `statement_timeout` of 10 seconds, because a definition's `limit` is the caller's to choose and the pool is ten connections.

Two boundaries hold at once: the definition's own filter (`regionMemberCan`, the same code `tenancy.test.ts` pins) and row-level security as the caller. Any registered definition may be read, which is exactly what the same caller may already sync through `/api/zero/get-queries`.

`readQuery` is the one remote function this change adds. `gates.test.ts` gets a `NO_GATE` entry for it with that reason.

Fails if the executor's rows differ from what zero-cache serves, if it cannot run as `app_writer`, or if it is too slow for the feed's tree. Task 4.3 compares the read with a privileged run for a member and task 10.3 times it; a difference or a slow read stops the change and goes to the user before the later packages build on it.

Alternative: the same reads written in Drizzle now (a second copy of a 170-line tree, for screens R2 rewrites). Contradicts the roadmap's line that `queries.ts` is type-only after the cutover: the definitions keep running on the app server until R2 makes the feed, the inbox and comments local and R3 writes the rest in Drizzle. Task 9.3 corrects the roadmap.

### D8. A server read is fetched again after an own write and on return

The server source exports `refreshReads()`, which fetches every live server read again, and does nothing while `isOnline()` is false. `write.powersync.ts` calls it after a write succeeds, `watchVisibility` in `powersync/db.svelte.ts` calls it where it restarts the sync after a stale return (one clock, not two), and the source calls it when the device comes back online. `db.svelte.ts` imports nothing for this: it offers `onStaleReturn(callback)`, a single slot because `start()` runs again on a token refresh, which `engine.powersync.ts` connects to `refreshReads`, because a remote module in its import chain breaks the browser tests that load it. One blunt rule instead of wiring each write to its reads: a screen shows one to three server reads, and an own write is rare next to reads.

The events and notifications packages add the third trigger, the change markers (D9).

### D9. Change markers kept by triggers

`region_counters` (`baseFields`, `region_fk` unique, cascading with the region, `events bigint`) and `user_counters` (`baseFields`, `auth_user_fk` unique, cascading with the auth user, `notifications bigint`). Row-level security on, no policies. They are markers, not counts: a number that moves when something changed, so a client knows to fetch again; the pill's and the badge's numbers still come from the server read.

The markers move when a transaction commits, not when a row changes. A counter row is a lock everyone in the region shares; taken mid-transaction it would be held while a handler goes on to lock entity rows, and handlers differ in order (a sub-area deletion records its event and then updates the parent, an area edit updates first), so two ordinary edits could deadlock and the loser's edit would be gone: `run()` answers a deadlock as the general failure and neither route sends it again. A fan-out that lost would lose its notification.

One function pair, `SECURITY DEFINER` with `search_path = public, pg_temp` for the reason `0115` gives for the comment count:

- `touch_marker()`, after each insert, update or delete of a row in `events` or `notifications`, adds the region or the user (of the old row and of the new one, since `carryLog` moves events between regions) to a transaction-local list (a custom setting, written with `set_config(..., true)`) unless it is already there. An update trigger on `notifications` carries a `WHEN` clause that skips a change of `pushed_at` alone: the reader sees nothing of it.
- `flush_markers()`, a deferred constraint trigger on the same rows, runs at commit. Its first call upserts every listed counter row, sorted, regions and users in one order, adds one to each and empties the list; later calls find it empty.

So all counter locks are taken at commit, in one order, and held only until it ends, so they add no deadlock; the lock on the parent is the one an event's insert already takes through its foreign key. An import moves its region's marker once.

Deletes upsert like the rest. `events.region_fk`, `notifications.region_fk` and `notifications.auth_user_fk` are NO ACTION, so at the delete the region or account still exists, but at commit a region deletion has also deleted the region. The upsert therefore skips a parent that is gone: its foreign key check waits for a deletion in flight, and a violation is caught per marker. (Found while applying: a `SELECT ... FOR KEY SHARE` on `auth.users` would need an update right on that table, which the function's owner may not have in production; the foreign key check runs as the table's owner.) an account's `auth.users` row goes in a later transaction and takes its counter with it through `on delete cascade`.

No backfill: a missing row means "no marker yet", and the first change creates it.

Cost: one list entry per row changed and one no-op call per row at commit; a 10,000-row import pays that, and nothing else does.

### D10. Stream entries, the client schema and the publication

In `deployment/powersync/sync-config.yaml`: `user_counters` (own row) and `content_reports` join `essentials`; `region_counters` joins `region_activity` under `my_regions`. Each carries the contested-signup check its stream has.

Own reports: `reporter_fk IN (SELECT id FROM users WHERE auth_user_fk = auth.user_id())` and an active membership in the report's region, the two conditions of the table's read policy. If the rules engine refuses two conditions in one query, the change stops and the user decides (the fallback is the reporter condition alone).

The client schema is generated (`npm run generate:powersync`); collections register themselves from it. `streams.server.test.ts` names every synced table, so the three join its lists with cases of their own.

The publication: the counters' migration (`0153`) adds the three tables to `powersync` when that publication exists (`DO $$ ... IF EXISTS ... ALTER PUBLICATION ... $$`), so CI's database, which has none, is unaffected. `ALTER PUBLICATION` needs its owner, and a table already listed aborts it: the block skips tables `pg_publication_tables` already lists, and a role that does not own the publication gets a warning instead of a failed release (it catches `insufficient_privilege`); the Migration Plan checks the list before the stream deploy. Task 6.4 runs both against a publication. The compose file's comment lists them for a fresh setup. zero-cache replicates the three as well (its publication is the whole schema); the volume is tiny and R3 ends it.

### D11. The guard is a list that only shrinks

`zeroClientGuard()` in `vite.sync-engine.ts`, beside `zeroGuard()`: in a PowerSync build or dev server, an import that resolves to `src/lib/zero/z.svelte.ts` fails unless its importer is in `ZERO_CLIENT_IMPORTERS`. After this change that list is `state/engine.powersync.ts` (switch-off package), `state/global.svelte.ts`, `components/StatusBar/StatusBar.svelte` and `routes/(app)/+layout.svelte` (shell package), and `entities/event/feed.svelte.ts` (events package). A test fails when a listed file no longer imports the client, so an entry cannot outlive its reason.

CI gains one step after the checks, `PUBLIC_SYNC_ENGINE=powersync npm run build`, at the end so the tests that read the built service worker still see the Zero build.

Alternative: forbidding `@rocicorp/zero` in the bundle. Rejected (user, 2026-11-24): the registry of mutator names, `dropAllDatabases` and the phase helpers need no client and move in R3.

### D12. Tests reach the mutators through both routes

`zeroClient` in `testHarness.ts` stays the one test client: with `MUTATE_ROUTE=sync` its `push` sends through `handleSyncMutate` and translates the answer to the result shape the suites assert on. One run of the entity and `src/lib/remote` suites with that variable puts every existing mutator test through the new route. This change runs that once and records the outcome; running both on every CI run is the writes package's.

### D13. Retention and the privacy page

`sweepAppliedWrites(before)` and `APPLIED_WRITE_MAX_AGE_MS` (30 days) live in `syncMutate.server.ts`, the one module that touches the table, as `sweepSpentChallenges` lives with its own logic; one more entry in the cleanup task. The offline-writes change must keep its queue younger than this, or a write replayed after its id was deleted would apply twice.

The privacy page lists every storage period, so both language files gain an item for the write ids. The wording is the user's to approve before the edit.

### D14. Where the code lives

Under `src/lib/zero/` and `src/lib/zero/server/`, beside what it wraps, although little of it is Zero: the folder is the one R3 takes apart, and a second home now would be moved again then. `read.remote.ts` sits beside the source that calls it. Its path is its endpoint id, so it is not moved before it is removed.

### D15. Removed before building (subtract pass, user 2026-11-25)

Cut from the first draft of this plan, with nothing taken from its scope:

- No second source module and no twin for the time-to-live source: one `source.svelte.ts` with one twin (D6). Two files and one `twins.ts` pair fewer.
- No `read.server.ts`: the read's body is the remote function (D7).
- No retention module: the sweep lives with the table's only writer (D13).
- No scrubber in the new route: `run()` already guarantees what a mutator may say (D3).
- No format rule for the write id on the server beyond non-empty and 64 characters (D1).
- No second test client: `zeroClient` switches route (D12).
- No test for what this change leaves alone (the rate limit, the cross-site list).

Removed from the code first, before the route is built: the remote write functions the mutators replaced. 44 of them in 12 entity modules had no importer outside tests (`areas` 5, `ascents` 2, `blocks` 5, `favorites` 1, `feedback` 1, `files` 1, `notifications` 4, `reactions` 2, `regions` 15, `routes` 2, `topos` 4, `users` 2), with about 2,800 lines of tests in 13 files that reach the handlers through them, and `redirectTo` in 15 server files that only those functions read. Left in place, this change would have added a third way to reach the same handlers beside a dead second one. They were deleted first, as the closing tasks of `migrate-writes-to-zero-mutators` (issue 1184, merged 2026-11-25), and that change is archived.

### D16. How the tests are written (TDD pass, user 2026-11-25)

The seams and the loop are stated once, at the top of tasks.md. What the pass changed in this plan:

- Tests come before what they need. The first draft built the three tables and both triggers in a group of their own and tested them last. Now `applied_writes` arrives with the test "a write applies once", the markers with the tests that watch them move, the stream entries with the tests of what a device holds. Hence two migrations instead of one.
- A test reads its result the way a caller would: after a write, through the query definitions the screens use, not by counting rows. The existing route test counts rows with SQL; these do not. The one exception is the change marker, whose row is what the trigger hands the stream.
- No test asks how often something of ours was called. "Applies once" is the area listed once and one event in the feed. The exception is deferred work, where a test mutator's own task is the observer, as `handleMutate`'s tests do it.
- Fakes sit at edges only: `fetch`, the clock, the token source, `readQuery` as the network edge of a resource, and `isOnline`, which this repo's tests already fake in ten files.
- The comparison of the server read with a privileged run (task 4.3) is kept beside the literal cases, and named for what it is: two ways of running one definition, so it shows what running as the caller changes and says nothing about the definition.
- Tests of code that already exists (the favorites suite, the deletions that must still succeed) cannot start red, so each names the production edit that turns it red.

## Risks / Trade-offs

- [A mutator behaves differently outside the push processor] → It runs in the same transaction class (D1); the entity suites run through the new route (D12).
- [The server read is slower or returns other rows than zero-cache] → Compared and timed before later packages build on it (D7); a miss stops the change.
- [A read runs with no region filter] → `readQuery` refuses a context without memberships and runs under row-level security; task 4.2 pins each with a case the other boundary would let through.
- [The Zero build changes] → Its diff is moves and exports (Goals); `resource.svelte.test.ts` and `mutate.server.test.ts` pass unchanged, and task 10.4 drives it, the upgrade of a warm device included.
- [The feed in the PowerSync build stops updating live after this change] → Accepted for a local preview; the events package adds the marker-driven refresh.
- [A trigger breaks a region or account deletion] → The commit-time upsert skips a parent that is gone and the counters cascade (D9); a test deletes a region and an account that have events and notifications.
- [The triggers add a write to every event and notification in production, on the Zero path too] → One upsert per transaction and region or user, at commit and in one order, so it adds no deadlock (D9, task 5.2).
- [A device that loads the new build and goes offline before its one re-sync ends lacks the guidebook] → As for every schema change here; one release carries both migrations, so it happens once. Task 10.4 upgrades a warm device.
- [The idempotency row is personal data kept for 30 days] → Named on the privacy page (D13), deleted with the account.
- [Three files change that parallel packages also touch: `twins.ts`, `engine.powersync.ts`, the guard list] → This package runs alone; later ones append or delete single lines.

## Migration Plan

1. Merge to `develop`; the release runs the two migrations (`0152` the write ids; `0153` the markers, their triggers and the publication change) with zero-cache deployed first, as for any schema change. A tab loaded before the deploy keeps working; a device that loads the new build opens a new local store and re-syncs once, because the Zero schema has three more tables.
2. With the user: check that `pg_publication_tables` lists the three tables for `powersync` in production. If the migration warned, the publication's owner adds them by hand now.
3. Deploy the stream config through the VPS workflow and wait for the PowerSync service's activation line. No production client reads from it.
4. Nothing builds with `powersync` in any deployment.

Rollback: revert the merge. The tables and triggers may stay (nothing reads them); to remove them, drop the triggers, then the two functions, then the three tables, and remove the three tables from the publication before the next stream config deploy.

## Open Questions

- Whether the rate limit needs keying on the user (D4): only real use behind shared addresses can say.
