# Day-1 facts (2026-11-07)

Read by the user on prod and on the VPS; pasted verbatim, decisions below.

## Prod Postgres

- `max_replication_slots` = 5.
- `pg_replication_slots`: one slot, `zero_0_a`, active, `reserved`, 56 bytes retained. Four free, so zero-cache and PowerSync can hold one each through the overlap release.
- `bunny_streams` per region: 34: 226, 32: 125, 4: 117, 33: 94, 36: 25, 41: 4, 37: 1.

## VPS `zero-arm-01`

- Memory 3,805 MB total, 1,194 used, 2,611 available, no swap.
- 2 CPUs.
- Disk 38 GB, 24 GB free on `/`.

## Decisions these settle

- `bunny_streams` is auto-subscribed (largest region 226 rows, threshold was 2,000). Task 2.1.
- Memory caps for the overlap release (task 7.2): MongoDB WiredTiger cache 512 MB, PowerSync service `NODE_OPTIONS=--max-old-space-size=768`. With zero-cache's resident ~1.2 GB that leaves ~1 GB headroom and no swap; a reconnect storm during the overlap is the one case this box cannot absorb, and it ends when zero-cache is removed one release later.
- Replication: one new slot, well within the five. Drop `zero_0_a` the day zero-cache stops (R3).

## Sync-rules evaluator (task 1.3)

`@powersync/service-sync-rules` 0.44.0 (the version bundled in `journeyapps/powersync-service:1.27.2`; 0.45.0 is on npm but under the 7-day release-age policy). Installed as a dev dependency and probed against the trial config (a throwaway script, since deleted): it parses in node. API: `SqlSyncRules.validate(yaml, { defaultSchema })` returns the service's own warnings (on the trial config: five, the `*` after an aliased `id`, and the four client-parameter streams flagged as unsuitable for authorization, which is exactly the check 2.4 wants), `SqlSyncRules.fromYaml(yaml, options).config` is a `SyncConfig` whose `hydrate(params)` gives the `HydratedSyncConfig` with `getBucketParameterQuerier({ globalParameters, hasDefaultStreams, ... })` for the parameter half and `evaluateRow({ sourceTable, record, ... })` for the data half. The membership test (2.4) runs both against rows read from the test Postgres. `@powersync/node` is installed for the EXPLAIN guard (6.1).

## Prod and first-sync measurements (2026-11-09)

Prod, read by the user: `max_slot_wal_keep_size` 512MB; slots `zero_0_a` and `powersync_1_f5de`, both active and `reserved`. First replication: engine started 14:44:44 UTC, first checkpoint 14:45:00. The user's account synced headlessly from prod in 1,466 ms (37,513 rows, 2.6 MB, 8 regions), of which the map's tables are areas 1,339, blocks 2,703 and geolocations 2,442 (~6,500).

First sync of `admin@` on the dev stack (30,008 operations, 12.4 MB; `guidebook[18]` alone 27,844), time for the big stream from connect to synced:

| Client and setting                                     | Seconds                                |
| ------------------------------------------------------ | -------------------------------------- |
| Chrome, IndexedDB (and `SimpleOpfsVFS`)                | 3.3                                    |
| iOS 27.2 Simulator, IndexedDB, map page                | 23.7                                   |
| iOS 27.2 Simulator, IndexedDB, Profile page            | 23.1                                   |
| iOS 27.2 Simulator, IndexedDB, sync in a shared worker | 25.6                                   |
| iOS 27.2 Simulator, `SimpleOpfsVFS` (2.7.0)            | 19.6, then no reconnect after a reload |
| User's iPhone, prod, home-screen app (user's account)  | 45 to 60, pill to done; Zero 4         |

Web Inspector recording of an iOS first sync: the page's main thread at 65 to 80% for the whole sync, the database worker at ~5%, and only 0.35 s of JavaScript sampled. Service defaults: `DEFAULT_DOCUMENT_BATCH_LIMIT` 1,000 operations and `DEFAULT_DOCUMENT_CHUNK_LIMIT_BYTES` 1 MiB per line. `wa-sqlite-jspi.wasm` (742 KB) contains no `powersync_init`; `wa-sqlite-async.wasm` (2.3 MB) and the cipher build `mc-wa-sqlite-jspi.wasm` (1.3 MB, with `powersync_init_static`) do. Swapping the plain JSPI build into PowerSync's worker failed at open (`TypeError: s is not a function`). Sources for the cause: WebKit bug 329813, as reported for wa-sqlite at https://github.com/lalexdotcom/browser-sqlite/issues/11 (Safari 27.2), and powersync-js #808 for the OPFS reload hang. Cause and decisions: design D12.

## Task 8.6: JSPI with PowerSync (2026-11-09)

`admin@` on the dev stack, a first sync read from the sync timeline (big stream, connect to synced):

| Client and setting                                                                              | Seconds |
| ----------------------------------------------------------------------------------------------- | ------- |
| Chrome, Asyncify (before)                                                                       | 3.3     |
| Chrome, JSPI (`mc-wa-sqlite-jspi`; the new Chrome baseline)                                     | 1.8     |
| iOS 27.2 Simulator, Asyncify, Profile (before)                                                  | 23.1    |
| iOS 27.2 Simulator, JSPI, Profile                                                               | 20.6    |
| iOS 27.2 Simulator, JSPI, Sync health, collections lazy (`PUBLIC_POWERSYNC_SKIP_COLLECTIONS=1`) | 20.4    |

The build probe (`select sqlite3mc_version()`) answered "SQLite3 Multiple Ciphers 2.3.3" in both Chrome and the Simulator, so JSPI ran in both. A store the Asyncify build wrote opened on the JSPI build in the Simulator, synced. The production build's `sw.size.test.ts` went red without the new precache glob and green with it.

Reading: D12's hypothesis does not hold. JSPI saves ~11% in WebKit (and ~45% in Chrome), and the TanStack collections cost nothing measurable (the "taken in" steps follow within 0.1 to 0.3 s). The time is spent inside PowerSync's own engine in WebKit, whatever the SQLite build, storage or screen.

Side observation: the page-load counter did not count the reload that the "new version" banner triggered in the Simulator (23 entries before and after). To check before the 8.4 soak.

iPhone, prod, the user's account, the Vercel preview with the JSPI swap (2026-11-09): the timeline names "JSPI (mc SQLite3 Multiple Ciphers 2.3.3)", so the iPhone's WebKit has JSPI. First block marker after the "Sign in" tap, from a screen recording: 30, 27 and 27 s (three runs). Guidebook stream: 23.4 s (connected 13.9 s, synced 37.8 s after the page loaded). Zero: 4 s. By 8.7's trigger, map first is due.

## Task 8.7: map first (2026-11-09)

Dev stack, `admin@`, the local service on this branch's config (the `map` stream active), a production build previewed on a fresh origin.

iOS 27.2 Simulator: the first block markers drew as count-unknown rings about 6 s after the page loaded (read off screenshots, not a recording), an area sheet opened meanwhile showed its skeletons, and the counts and the grade histogram filled in at about 26 to 30 s with no marker moving.

Chrome, fresh isolated profile per run, downloading to "synced: all": 2.6 s on the first run after the service restart, then 1.7 and 1.7 s, against 8.6's 1.8 s. `map` was confirmed and taken in 0.7 s after downloading began.

iPhone, prod, the user's account, the Vercel preview with map first and the `map` stream live on prod (2026-11-10), timed from the "Sign in" tap on a screen recording, website data deleted before each run:

| Run | First block marker (count unknown) | Counts filled in |
| --- | ---------------------------------- | ---------------- |
| 1   | 3 s                                | 27 s             |
| 2   | 3 s                                | 28 s             |
| 3   | 3 s                                | 28 s             |

Zero's build: first marker 4 s. Before map first (8.6, JSPI): 27 to 30 s. Timeline of the last run, from connecting: `map` synced 1.2 s and taken in 1.8 s after it, `guidebook` synced 24.6 s and taken in 25.1 s after it. The guidebook's first sync itself is unchanged; map first moves the map out from behind it.
