# Design

## Context

See proposal.md for why. The code facts the design rests on (counted on 2026-11-07):

- Reads: 44 Zero query definitions (34 in 16 entity `queries.ts` files, 10 in `src/lib/zero/guidebook.ts`), consumed through 46 resource factories in 17 `resources.svelte.ts` modules plus 15 `createResource` sites in `EntitySearch` and `Markdown`. 26 screens read `QueryState`, 10 use `summaryOf`, 13 forms use `waitFor`. The trial proved the pattern on the block page: a TanStack DB live query reshaped into Zero's camelCase row (`src/lib/powersync/block.svelte.ts`), so the mapper, `QueryState`, `summaryOf` and `Form` ran unchanged and the page diff was four import lines.
- Sync shell: about 2,000 lines in `src/lib/zero/{z,resource}.svelte.ts`, `offline.ts`, `connection.ts`, `authRecovery.ts`, `ttlSource.svelte.ts`, `coverage.ts`, `src/lib/state/{sync,online,pill,device}.svelte.ts`, 13 test files. Half of it exists because Zero has no stream-level "has synced" signal. Only 8 non-test files import `z.svelte` directly.
- Trial code in this worktree: `src/lib/powersync/{db.svelte,resource.svelte,collections,schema,block.svelte,favorite.svelte}.ts`, `trial3-setup/powersync-mongo/{service,sync-config}.yaml` (11 streams, 20 tables), the headless clients in `trial3-setup/datausage/`.
- Prod: one VPS, `deployment/docker-compose.zero.yml` (zero-cache 1.11, a CVR Postgres, `nginx-main` with a host-certbot cert), deployed by `.github/workflows/deploy-zero.yml` from a Bitwarden allowlist of `ZERO_*` keys. The app on Vercel knows only `PUBLIC_ZERO_URL`.
- Constraints: never two engines in a shipped build; the deploy-gap rule (one release of overlap, args only widen); AGENTS.md's worktree rules (no shared-DB migration from a worktree, stage by name).

## Goals / Non-Goals

**Goals:**

- The guidebook screens read from PowerSync with the same observable readiness behaviour (`sync/query-readiness`) and the same resource signatures, so the migration is measurable on the user's iPhone with the feed and writes untouched.
- A production-shaped service: on the VPS, through nginx and TLS, with compaction, and with the membership boundary tested on every `npm test`.
- Nothing that has to be undone in R1 to R3 except the measurement switch.

**Non-Goals:**

- Any write path change, the feed window, the inbox, comments: see proposal Non-goals.
- Perfect types for the row shim: `queries.ts` and the generated Zero schema stay as type-only sources.
- A desktop opt-out of whole-region sync. One stream subscription can bring it back later.

## Decisions

### D1. Reads: one resource adapter, mappers unchanged

Extend the trial's `psResource` (`src/lib/powersync/resource.svelte.ts`, 40 lines) into the one way a resource is built: a TanStack DB live query plus a `select` that reshapes rows through a `toZeroRow` shim (snake_case ISO rows to camelCase ms timestamps, parsed jsonb, booleans, unwrapped parent chains). Each `entities/<name>/resources.svelte.ts` keeps its exported factories and replaces the `createResource(query, mapper, opts)` bodies in place. The 18 mappers do not change.

Alternatives: rewrite the mappers against PowerSync rows (a day more now, and the row shape is still in flux until the feed lands in R2); a parallel `src/lib/powersync/<entity>.svelte.ts` set as the trial did (AGENTS.md says components read through the entity's resources module, and the trial's aliased imports are the thing to undo).

Per query, three shapes:

- Plain table reads (about 22, the ten `guidebook*` queries among them): a live query over one collection. The `guidebook*` definitions and the `register` composites in `offline.ts` are deleted; the screens' own queries answer from the synced tables.
- Joined trees (13: `area`, `listAreas`, `listBlocks`, `blockTopos`, `listRoutes`, `listRoutesForMap`, `listRouteAscents`, `listUserAscentsDetailed`, `ascent`, `listRouteFiles`, `parking`, `listRegionMembers`, `listFirstAscensionists`): TanStack nested subselects for detail trees; raw SQL through `db.watch` for the list and map screens, where EXISTS filters and ILIKE have no TanStack form. Every raw statement is checked with `EXPLAIN QUERY PLAN` in a test (D7): the trial measured a LEFT JOIN through PowerSync's views at 6 s because SQLite cannot use the index through them; inner joins and correlated subqueries search the index (27 to 39 ms).
- Text search (`listRoutes` content filter, `EntitySearch`, `listUsers`): filtered in JS with `toLocaleLowerCase` over the synced rows. SQLite's LIKE is case-insensitive for ASCII only, so umlauts would diverge from Postgres ILIKE; the row counts are a few thousand. The cost is not the comparison but loading the rows into JS: an eager collection holds its whole table in memory once a query touches it, and on-demand mode cannot help because this filter does not compile to SQLite. So 6.4 measures it on the largest region before it is settled; the alternative is a lowercased name column computed in Postgres and synced, matched with SQLite `LIKE` so only the hits reach JS (user search keeps JS: a region's members are a few dozen rows).

`waitForArea/Block/Route` (4 callers, after a server write with a serial id) become a live query on the id with the same 5 s cap. `holdWhileDeleting` is engine-agnostic and stays.

### D2. Sync shell: PowerSync status replaces the hand-built signals

`src/lib/powersync/db.svelte.ts` grows into the shell: one `PowerSyncDatabase` per account file (`grnyte-<uid>.sqlite`), the connector pulling its token from `supabase.auth.getSession()` inside `fetchCredentials` (which removes `authRecovery.ts`, its test and the layout's second effect), status into `$state`. Deleted: `z.svelte.ts`, `offline.ts`, `coverage.ts`, `ttlSource.svelte.ts`, `connection.ts`, `src/lib/logging/resumeLog.ts` and the `settings/errors` section that renders it, the three sync stamps and their tests. Kept with their public contract: `QueryPhase`/`QueryResource`/`resolvePhase`/`summaryOf` in `resource.svelte.ts` (49 importers; the file moves to `$lib/sync/` in R3 with one mechanical rename), `isOnline` (25 non-test importers), `PillSurface`, `wipe.ts`, `device.svelte.ts`, the status bar shape.

Mappings:

- `arriving` and `answered`: see D9 (revised during 5.2; the stream's own `hasSynced` alone proved wrong).
- "not syncing" (the status-bar branch with a reload action) does not apply to PowerSync (revised during 4.3): the branch exists because Zero's `closed` and `error` never recover without a reload, while PowerSync retries forever and pulls a fresh token itself. Mapping a download error to it would also misfire offline, where PowerSync reports a download error too. So everything short of connected maps to one non-terminal name (`connectionOf` in `online.svelte.ts`), shown as "reconnecting", or "offline" once the hold fires.
- `isOnline`: fed from `status.connected` with the same reconnect hold as today.
- Cold-store copy ("first run" vs "restore"): one localStorage stamp written when `hasSynced` first turns true.
- Resume after suspend (`sync/query-readiness`, the re-establish requirement): PowerSync reconnects on its own; `arriving` derives from `status.connected` and `hasSynced`, so a connection that died while suspended reads as reconnecting, never as current. Verified on the iPhone in task 8.4.
- Status events: the listener only. The trial's finding that events never fire on iOS Safari did not hold on `@powersync/web` 2.6.0 in the iOS 27.2 Simulator: 8 to 28 listener events per load, and a 250 ms poll only ever caught the status from before the listener attached. The poll was removed on 2026-11-07.
- Essentials before guidebook: the `essentials` stream syncs at priority 0, and the shell waits for priority 0's completion before rendering the first screen, as the reference stamp did.

Account switch keeps the reload contract (`wipeAndLeave` reloads). `clearPowerSync` deletes every `grnyte-*` IndexedDB database (the store, see D5's client store note), not only the open one (the trial's `shortcut:` note); where `indexedDB.databases()` is missing (Firefox before 126) it deletes the file this page opened. First boot after the switch calls `dropAllDatabases()` (already in `wipe.ts`) once, keyed by a localStorage flag, while `@rocicorp/zero` is still installed.

### D3. Streams: the trial config promoted, as the tenancy boundary

`deployment/powersync/sync-config.yaml` starts from `trial3-setup/powersync-mongo/sync-config.yaml`, with priorities (user, 2026-11-07): `essentials` at 0 (grades, role_permissions, my regions, my own user row and my role: what Zero's `KEPT.reference` held; the trial's name `reference` is retired), `guidebook`, `region_activity` (everyone's ascents and `region_members`), `members` (users of my regions, former members included since 2026-11-07: their ascents stay in the region's activity and need the name they were logged under) at 1, and `media` (`bunny_streams`) at 2; favorites travel region-wide in `region_activity` and `user_settings` in `essentials`, so the trial's `personal` stream is gone. `members` stays the trial's subquery, one bucket per co-member, shared by everyone who sees that user: at 12 to 25 buckets per reader it is far from the 1,000 limit, and a per-region bucket would need profile fields copied onto `region_members` by a trigger (user, 2026-11-07). Removed for this milestone: `feed*`, `thread`, `profile_user`, `region_reactions` (R2). Added: `favorites` region-wide for the save count (`listEntityFavorites`), `user_settings`, `user_roles`, `bunny_streams` by region (route media on the ascent list; auto-subscribed unless day 1's count shows over 2,000 rows in a region, then on demand; task 2.1 records the choice), `routes_to_tags` with its composite text id. Every synced table has a primary key (`routes_to_tags` a composite one), so no replica identity change is needed.

A region's guidebook arrives as one unit, so a screen opened before its region has synced once shows arriving, and once synced no screen of that region ever waits (the `sync/query-readiness` delta). D12 plans to split the map's tables ahead of the rest if task 8.7 runs; the priorities then change as D12 lists. Rule 2 of the remeasure is what checks that the first open is no worse than today.

The predicates are the whole boundary: RLS does not see the sync path. So the review loop runs with `+security` against the 39 cases in `src/lib/db/regionPolicies.test.ts` (deactivated membership, soft-deleted regions, `files.visibility`, content_removed rows), and D7 adds a test that runs on every `npm test`.

Ascents of a deleted route (the route is soft-deleted so an undo restores them; the ascents stay live) still sync, and the ascent resources hide them: a deleted route takes its ascents with it on screen (the user's decision, 2026-11-07). Filtering them in the stream instead (`route_fk IN (SELECT id FROM routes WHERE deleted_at IS NULL)`) was measured with the sync-rules engine to make one bucket per live route, past the 1,000-bucket limit in any real region.

A sync-config change re-replicates the whole upstream before activating (20 to 90 s at trial size). Config deploys are separate from app deploys, and the service log's activation line is the signal.

### D4. Client schema generated from drizzle, not hand-written

`src/lib/powersync/schema.ts` is generated by a small script from `src/lib/db/schema.ts` for the tables the sync config names (snake_case columns, `nid` integer copies for every joined table because PowerSync's `id` is text and TanStack compares strictly, declared indexes for every column a `where` or join reads). A test pins the generated table list to `deployment/powersync/sync-config.yaml`. The trial hand-wrote only the block page's columns, which is where silent column drift would land across 44 trees.

### D5. Infra: beside zero-cache, its own name, its own secrets

`deployment/docker-compose.zero.yml` gains `powersync-prod` (`journeyapps/powersync-service:1.27.2`, `service.yaml` and `sync-config.yaml` bind-mounted read-only from `deployment/powersync/`) and `mongo-prod` (`mongo:7`, single-node replica set, WiredTiger cache capped at 1 GB, on an internal network, derived state, no backup). `nginx.zero.conf` gains a server block for `sync.grnyte.rocks` with `proxy_buffering off`, `proxy_read_timeout` over an hour and `proxy_http_version 1.1`: the existing block's 60 s read timeout would cut the sync stream every minute. The block is tested locally with `nginx:alpine` in front of `trial-ps-mongo` before it touches the box. Compaction: a sidecar service looping `sleep 3600` then `compact`, so the deploy owns it. `api.parameters.max_concurrent_connections` set deliberately (the trial's default returned 429 to 550 of 750 reconnecting devices).

Secrets: `POWERSYNC_*` through the same Bitwarden allowlist in `deploy-zero.yml` and `secrets.mjs`, `PUBLIC_POWERSYNC_URL` on Vercel. The Supabase HS256 secret as `client_auth.supabase_jwt_secret`. Prod Postgres: `create publication powersync for table ...` listing the synced tables, over the direct connection, never the pooler (`wal_level=logical` is already set for zero-cache). First the user reads `show max_replication_slots` and `pg_replication_slots`: two consumers must fit for the overlap release, and a slot whose consumer is down retains WAL on the capped disk.

Docs review (2026-11-07, against docs.powersync.com and the service source). Each item lands in the group 7 task named:

- Replication slots (7.3, 7.4): PowerSync holds one slot, plus a second while it reprocesses a new sync config. A config deploy therefore needs zero-cache's slot and two PowerSync slots at once, not two in total. Set `max_slot_wal_keep_size` so a stalled consumer cannot fill the capped disk, and watch `replication_lag_bytes` and `safe_wal_size` in the Diagnostics API through each 20 to 90 s reprocess.
- Connections (7.2): the docs cap an API container at 200 concurrent connections and recommend 100 or fewer, with one replication process beside the API containers. `max_concurrent_connections: 2000` in one process goes against that. Either run API containers (`start -r api`) behind nginx with one `start -r sync`, or keep one process and measure memory, `powersync_concurrent_connections` and event-loop lag under the 750-device reconnect, recording the choice here. Either way set `NODE_OPTIONS=--max-old-space-size-percentage=80` and a container memory limit.
- Limits (7.2): `max_buckets_per_connection` and `max_parameter_query_results` are 10000 against a documented default of 1000, which the docs say to raise only after reducing bucket count. Drop both, or set a measured number with a one-line reason (`members` costs one bucket per co-member).
- Health and monitoring (7.2, 7.3): `healthcheck.probes` (`use_http`, `use_filesystem`) with a compose healthcheck on `/probes/liveness`; `telemetry.prometheus_port` on the internal network only; a cron or sidecar posting `/api/admin/v1/diagnostics` with the admin token, alerting on a non-empty `errors` or replication lag.
- Admin API (7.1): `location /api/admin/ { deny all; }` in the `sync.grnyte.rocks` block; diagnostics are reached from inside the docker network.
- MongoDB sizing (7.2): the docs ask for a three-node replica set with 2 GB or more each in production and call a single 2 GB node the minimal setup. The planned single node with a 1 GB cache is below both. Bucket storage is derived and rebuildable from Postgres, so a single node is a defensible choice, but it is stated here as one, and the cache cap is raised to 2 GB unless the VPS memory says otherwise.
- Defragmentation (after 7.4): compaction cannot shrink a bucket whose rows are inserted and deleted often. Once metrics exist, compare operation counts with row counts for the `favorites` and `ascents` buckets; if they diverge, a pg_cron job touching every row of the table shortly before a compact rewrites them. Never redeploy the config to clean history.
- JWT (with the deferred signing-key migration): when Supabase moves to asymmetric keys, drop `supabase_jwt_secret` and keep `supabase: true`, which configures JWKS itself.
- Client store (7.5): the client keeps the default IndexedDB store (`IDBBatchAtomicVFS`). The docs recommend OPFS (`OPFSCoopSyncVFS`) for Safari and for several tabs, and it was tried on 2026-11-07: in the iOS 27.2 Simulator a cold Safari opened, synced and confirmed on OPFS, but a reload in the same Safari left the previous page's instance holding the file (two `.ahp-` folders), and the new page stayed connected without ever completing a sync, still `arriving` after 45 s. The same reload on IndexedDB confirmed every stream. Revisit OPFS only with a reload test that passes on WebKit. Retested 2026-11-09 in the iOS 27.2 Simulator, every OPFS VFS still fails in WebKit: `OPFSWriteAheadVFS` needs the Chromium-only `readwrite-unsafe` handles and never connects; `OPFSCoopSyncVFS` (2.6.0) and `SimpleOpfsVFS` (2.7.0, released that day) sync once, but after any page reload the new page never opens a sync stream (powersync-js #808). OPFS would only have shortened the iOS first sync by ~17% (facts.md: 19.6 s against 23.7 s; `SimpleOpfsVFS` is in 2.7.0 only, so the pinned 2.6.0 cannot select it). IndexedDB stays. The service worker precaches the async `wa-sqlite` wasm and raises Workbox's 2 MiB `maximumFileSizeToCacheInBytes`, which its 2.26 MB build exceeds. Check the emitted names in a real build.

Recorded for 7.2 (2026-11-08, taken overnight without the user, open to reversal):

- One unified process, not API containers: facts.md leaves ~1 GB beside zero-cache, so the box holds one service (`NODE_OPTIONS=--max-old-space-size=768` from facts.md, not the percentage flag, plus `mem_limit: 1g`). `max_concurrent_connections` goes back to the documented 200; prod concurrency is far below it. If it nears 200, split into `start -r api` containers once zero-cache is gone.
- Both 10000 limits dropped to the default 1000. `members` costs one bucket per co-member, so 7.3 reads the largest prod member count first.
- MongoDB cache 512 MB per facts.md (overrides the 2 GB above: the VPS memory says otherwise), single node, `mem_limit: 1g`, on an internal network with no auth.
- Health: `healthcheck.probes.use_http` with a compose healthcheck through `node -e fetch` (the image has no curl). Prometheus on 9464, published nowhere.
- Diagnostics: a documented manual call in `deployment/README.md`. The scheduled poll waits for an alert channel the box does not have.
- Prod sslmode `verify-full`: the service's default CA bundle covers Supabase's certificate.

Local dev: one `docker compose` for PowerSync plus MongoDB started from the main checkout against the shared Supabase DB (one publication, one slot), shared by every worktree like zero-cache today. `e2e/support.ts` requires it in place of zero-cache. CI keeps plain Postgres and `ci/shim.sql` untouched (no Zero server piece changes in this milestone).

### D6. The measurement switch

The milestone branch still holds the Zero client for feed, inbox, comments and writes. The remeasure must run on one engine (the control soak showed two engines caused the rule 8 reloads), so `src/routes/(app)/+layout.ts` gets a build-time switch (`PUBLIC_SYNC_ONLY_POWERSYNC`) that skips Zero's init; the screens still on Zero then render their offline state. The switch and the Zero init both go in R1.

### D7. Tests

- Stream membership: PowerSync's sync-rules package evaluated in-process against the test Postgres for insider, outsider and deactivated member (package and API verified in task 1 before relying on it; the fallback is the parameter queries as plain SQL with the claims substituted). Plus one Playwright "outsider sees nothing of region A" smoke.
- `resource.svelte.test.ts` and `offlineRules.test.ts` rewritten over `SyncStatus` at the TanStack collection boundary (the jsdom project cannot load `@powersync/web`'s wasm).
- EXPLAIN guards: `EXPLAIN QUERY PLAN` for every raw statement, run through `@powersync/node` (dev dependency) opening the generated schema in a temporary file, because the `<table>` views PowerSync queries go through exist only once a PowerSync client has opened the database; asserting no SCAN of routes, blocks, areas or ascents.
- A schema pin: the generated client tables equal the sync config's tables.
- `tenancy.test.ts`, `offline.drift.test.ts`, `composite.test.ts`, `ttlSource.svelte`, `authRecovery` tests deleted with their modules.

### D8. Mutate paths (R1, recorded here so the milestone does not block it)

`/api/sync/mutate/+server.ts` and `/api/zero/mutate/+server.ts` import one handler. The old path stays through R1 and R2 for zero-cache's `ZERO_MUTATE_URL`; R2 replaces the implementation under the new path; R3 deletes the old path and `zero_0`.

### D9. When a PowerSync resource answers (decided during 5.2)

An empty answer is a claim the app acts on: the layout sends a member with no regions to `/regions/new`, forms show not found, empty states replace skeletons. Zero's `answered` meant the server confirmed the query in this session. PowerSync's own flags do not mean that, and the first drive of 5.2 showed both gaps: a five-region member signing in was sent to `/regions/new`.

- PowerSync stores a stream's `hasSynced` and `lastSyncedAt` on disk and reports them on open, before it reconnects. They describe the previous session.
- The TanStack collections copy synced rows in after PowerSync applies them: each collection's diff triggers write to its own TEMP tracking table, flushed on a throttled change callback (on an OPFS store they would be ordinary tables, which the probe would then have to read from `sqlite_master` too). For a moment the stream reads synced while the collection is still empty.

So `psResource` (`src/lib/powersync/resource.svelte.ts`) decides from these:

- Online, a resource answers once its stream is confirmed (`streamConfirmed` in `db.svelte.ts`): its `lastSyncedAt` is at or after the moment the file was opened, and a probe under the write lock finds this tab's tracking tables empty. Until then, rows already on the device show as `arriving`: visible, but nothing treats an empty result as true.
- The probe counts only the tracking tables this tab's collections registered (`registerCollections`, from each collection's `utils.getMeta()`). Desktop tabs share one connection, so a closed tab's tables stay on it and would hold confirmation back for the rest of the browser session.
- Offline, a stream that ever synced answers from disk, since every device holds its regions whole (D3). One that never synced is `unavailable`, which the global state turns into the cold-store screen.
- The answer is latched per query (keyed on the dep values), as Zero's is: coming back online does not turn an answer back into `arriving`.
- Never `error`: PowerSync retries a failed download itself, and reports one whenever it is offline. A download error held during the first load counts as "nothing coming" for `isStoreCold` instead.

Alternatives: trust `hasSynced` (the bug above); wait a fixed delay after a sync for the collections to flush (correct only on a fast device, and the bounce it would let through navigates away); query SQLite directly for every absence claim (a second copy of each query).

### D10. SDK versions (decided 2026-11-07)

`@powersync/web` 2.6.0 and `@powersync/node` 1.3.0 (dev), so one `@powersync/common` 2.5.0 serves the client, the scripts and TanStack's collection (node 1.2.0 pinned common 2.4.0 exactly and would have left a second copy). The user overrode the two-week release-age rule for this upgrade, for the `connectTimeoutMs` and cancel-on-disconnect fix to checkpoint requests (powersync-js #1173). A plain `npm install` against the lockfile is unaffected by the rule; only adding or bumping a package inside the window needs it overridden again.

### D11. Recorded for the offline-writes PR (so the milestone does not decide it by accident)

- `uploadData` first: a real one that sends each queued change to the app server, which runs the existing mutator. While the upload queue holds anything the client does not take a new checkpoint, so one local write against today's no-op `uploadData` would freeze sync.
- Ids: serial ids stay. Toggles (favorites first) sync with a natural composite id (user plus entity, as `routes_to_tags` already does), so a client can create and delete them offline with no new column. Tables whose rows are created offline (ascents first) gain a native `uuid` column beside the serial, filled by `gen_random_uuid()` in SQL and `crypto.randomUUID()` in the client (both inside the browser floor), and synced as the PowerSync `id`. Files stay cuid2. No migration to UUID primary keys: every foreign key would change type and the id-based URLs, which never break, would need redirects.
- Checkpoint requests: alpha (no beta or GA date published). Only ever a UI gate (releasing an optimistic state, waiting before showing a just-created row), always behind our own timeout and a fallback, never for correctness. They need `checkpointMode: 'requests'` on connect, and a failing checkpoint-request call fails the whole sync attempt, so force that failure in dev before relying on it.
- The favorite overlay (`save.svelte.ts`) is retired by that PR: a local write stays visible until the server's checkpoint replaces it.

### D12. iOS first sync (found during 8.1, 2026-11-09)

A first sync on iOS takes far longer than elsewhere. Measured on different datasets, so compare within a row group only (facts.md has each):

| Client                             | Data                                     | Big stream, synced to done           |
| ---------------------------------- | ---------------------------------------- | ------------------------------------ |
| Node, headless                     | user's prod account, 37,513 rows, 2.6 MB | ~1.5 s for everything                |
| Chrome, same build                 | `admin@` on dev, 30,008 ops, 12.4 MB     | ~3.3 s                               |
| iOS 27.2 Simulator, Safari         | `admin@` on dev, same                    | 23 to 26 s                           |
| The user's iPhone, home-screen app | user's prod account                      | 45 to 60 s, pill to done (Zero: 4 s) |

Ruled out as the cause: rendering (23.1 s on Profile against 23.7 s on the map), though the TanStack collections, built for every synced table from any screen and taking every row in on the main thread, ran in both measurements and are not ruled out; where the sync runs (a shared worker via `enableMultiTabs`: 25.6 s), and per-line overhead (the service packs 1,000 operations or 1 MiB per line, so ~30 to 40 lines).

**Leading hypothesis, not yet proven.** `IDBBatchAtomicVFS` always loads wa-sqlite's Asyncify build, and WebKit bug 329813 makes Asyncify code ~10x slower after a few seconds of work: the small `essentials` stream syncs in 0.3 s, the large one does not. Against it: the Web Inspector recording (facts.md) shows the page's main thread at 65 to 80% and the database worker at ~5%, with only 0.35 s of JavaScript sampled, so where the time is spent is not settled. Task 8.6 tests the hypothesis directly. Safari 27 supports JSPI, which avoids the Asyncify path. The plain `wa-sqlite-jspi.wasm` lacks the PowerSync core, but the cipher build `mc-wa-sqlite-jspi.wasm` (1.3 MB) contains it (`powersync_init_static`); `@powersync/web` loads the `mc-*` builds when an `encryptionKey` is set. OPFS is out (D5).

Decisions (user, 2026-11-09). The iOS web experience must not get worse than Zero's while the Expo app (native SQLite, unaffected) is months away:

- **JSPI with PowerSync itself first (task 8.6, user, 2026-11-09, after review finding P1).** Load `mc-wa-sqlite-jspi` for `IDBBatchAtomicVFS` where `WebAssembly.Suspending` exists, through a build-time swap in PowerSync's worker (a Vite `transform` on `@powersync/web/lib/db/adapters/wa-sqlite/vfs.js`, also registered under `worker.plugins`, failing the build if the import it replaces changes), and measure the first sync. If it lands near Chrome, the hypothesis holds and this is the fix for iOS 27+; iOS 26 and older keep Asyncify.
- **Map first (task 8.7)**, if 8.6 is not enough or for the older iOS versions. The map's tables move into a stream ahead of the rest of the guidebook. Priorities become: `essentials` 0, the new `map` stream 1 (`areas`, `blocks`, `geolocations`), `guidebook`, `region_activity` and `members` 2, `media` 3. The `map` stream copies `guidebook`'s `my_regions` membership and contested-signup predicates, is `auto_subscribe: true` and takes no subscription parameter. Two consequences: the guidebook no longer arrives as one unit (query-readiness spec and D3 change with it), and a device cut off after the map but before the guidebook answers map screens from disk while route screens are `unavailable` offline (D9). Map-ready means markers (user, 2026-11-09): the map shows them as soon as areas and blocks are in, in a "count unknown" state the size of a counted marker with no text, and the route and grade counts fill in when routes land; a block with no routes then shrinks to the small dot, accepted because it is rare. Rule 1 itself times the first block marker drawn on both builds (task 8.2).
- **Upstream (task 8.8).** An issue to powersync-js, after 8.6 settles the cause: ask to load the JSPI build where available, and report the OPFS reload hang.
- The experiment switches `PUBLIC_POWERSYNC_VFS` and `PUBLIC_POWERSYNC_MULTITABS` are measurement aids that R1 removes, with the measurement switch, the page-load counter and the sync timeline (Workflow follow-up in tasks.md). While set to an OPFS VFS, sign-out leaves that account's OPFS files behind (`clearPowerSync` lists IndexedDB only), so no build with an OPFS value ships.

## Risks / Trade-offs

- [iOS first sync, D12] → JSPI with PowerSync (8.6), then map-first priorities if needed (8.7); the remeasure records whatever remains.

- [nginx has never fronted the stream] → the block is proven locally against `trial-ps-mongo` with a 10-minute idle connection before the VPS deploy.
- [Replication slot headroom on prod] → read before day 1; if only one slot is free, the overlap release shortens to days with a forced service-worker reload.
- [Status events on iOS] → listener only, verified in the iOS Simulator; the rule 8 soak on the iPhone (8.4) would show a stalled status.
- [The row shim hides column drift] → the generated schema (D4) and one mapper snapshot test per migrated entity.
- [Raw SQL scans on a phone] → the EXPLAIN guard (D7) on every raw statement; none ships without it.
- [Two engines on the branch during the milestone] → the measurement switch (D6); the branch is never released in that state.
- [`EventMeta`'s "last edited by" line on area, block and route pages reads `listEvents` through `eventList`] → it stays on Zero for the milestone and becomes a server read in R1.
- [The 1,000 parameter-lookup cap] → every stream is single-table and region-level; `members` is a subquery over region_members, which the trial measured at 14 lookups for a two-region user.

## Migration Plan

Milestone only; nothing deploys to users.

1. Infra on the VPS beside zero-cache, service reachable at `sync.grnyte.rocks`, syncing prod data to the user's own prod account.
2. Branch `feature/powersync` in a fresh worktree off `develop`; trial code ported by file, not merged.
3. Reads and shell land per task group with a review loop after reads.
4. Remeasure on the user's iPhone (home-screen app, a Vercel preview of this branch with the switch on; the Zero baseline is grnyte.rocks itself): rule 1 cold start and reopen to map-ready, rule 2 screens, rule 8 one-hour soak, each against today's Zero build. Pass means no worse. iOS checks run in the iOS Simulator first; the iPhone carries only what the Simulator cannot measure: the rule 1 and 2 timings and the rule 8 soak.
5. Go/no-go. On no-go, the VPS services are removed and the branch is kept.

Rollback at this stage is deleting two containers and one publication.

## Open Questions

- Whether `bunny_streams` auto-subscribes region-wide or stays on demand: decided by its row count per region, which the user reads from prod on day 1. Either way the stream exists.
- Whether `members` stays a subquery stream or becomes region-level with a `region_members` join on the device: the trial measured the subquery at 14 lookups for two regions, so it is fine until a region with many members shows otherwise.
