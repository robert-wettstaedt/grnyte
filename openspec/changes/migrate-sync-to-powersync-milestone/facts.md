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
