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
