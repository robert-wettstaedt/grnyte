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
- Text search (`listRoutes` content filter, `EntitySearch`, `listUsers`): filtered in JS with `toLocaleLowerCase` over the synced rows. SQLite's LIKE is case-insensitive for ASCII only, so umlauts would diverge from Postgres ILIKE; the row counts are a few thousand.

`waitForArea/Block/Route` (4 callers, after a server write with a serial id) become a live query on the id with the same 5 s cap. `holdWhileDeleting` is engine-agnostic and stays.

### D2. Sync shell: PowerSync status replaces the hand-built signals

`src/lib/powersync/db.svelte.ts` grows into the shell: one `PowerSyncDatabase` per account file (`grnyte-<uid>.sqlite`), the connector pulling its token from `supabase.auth.getSession()` inside `fetchCredentials` (which removes `authRecovery.ts`, its test and the layout's second effect), status into `$state`. Deleted: `z.svelte.ts`, `offline.ts`, `coverage.ts`, `ttlSource.svelte.ts`, `connection.ts`, `src/lib/logging/resumeLog.ts` and the `settings/errors` section that renders it, the three sync stamps and their tests. Kept with their public contract: `QueryPhase`/`QueryResource`/`resolvePhase`/`summaryOf` in `resource.svelte.ts` (49 importers; the file moves to `$lib/sync/` in R3 with one mechanical rename), `isOnline` (25 non-test importers), `PillSurface`, `wipe.ts`, `device.svelte.ts`, the status bar shape.

Mappings:

- `arriving`: collection `isReady` plus the stream's `hasSynced` (per stream, looked up by name and parameters).
- "not syncing" (the status-bar branch with a reload action): a `downloadError` held for the existing hold time while `isOnline()`, or a 401 from `fetchCredentials`. PowerSync has no terminal state, so this replaces `connection.ts`'s TERMINAL set.
- `isOnline`: fed from `status.connected` with the same reconnect hold as today.
- Cold-store copy ("first run" vs "restore"): one localStorage stamp written when `hasSynced` first turns true.
- Resume after suspend (`sync/query-readiness`, the re-establish requirement): PowerSync reconnects on its own; `arriving` derives from `status.connected` and `hasSynced`, so a connection that died while suspended reads as reconnecting, never as current. Verified on the iPhone in task 8.4.
- iOS: status events do not fire on iOS Safari without shared workers (trial finding). `db.currentStatus` is polled at 250 ms while `document.visibilityState === 'visible'`, beside the listener, on every platform.
- Essentials before guidebook: the `essentials` stream syncs at priority 0, and the shell waits for priority 0's completion before rendering the first screen, as the reference stamp did.

Account switch keeps the reload contract (`wipeAndLeave` reloads). `clearPowerSync` deletes every `grnyte-*.sqlite` file through the OPFS adapter, not only the open one (the trial's `shortcut:` note). First boot after the switch calls `dropAllDatabases()` (already in `wipe.ts`) once, keyed by a localStorage flag, while `@rocicorp/zero` is still installed.

### D3. Streams: the trial config promoted, as the tenancy boundary

`deployment/powersync/sync-config.yaml` starts from `trial3-setup/powersync-mongo/sync-config.yaml`, with priorities (user, 2026-11-07): `essentials` at 0 (grades, role_permissions, my regions, my own user row and my role: what Zero's `KEPT.reference` held; the trial's name `reference` is retired), `guidebook`, `region_activity` (everyone's ascents and `region_members`), `members` (users of my regions) and `personal` (favorites, user_settings own rows) at 1, `bunny_streams` at 2. `members` stays the trial's subquery, one bucket per co-member, shared by everyone who sees that user: at 12 to 25 buckets per reader it is far from the 1,000 limit, and a per-region bucket would need profile fields copied onto `region_members` by a trigger (user, 2026-11-07). Removed for this milestone: `feed*`, `thread`, `profile_user`, `region_reactions` (R2). Added: `favorites` region-wide for the save count (`listEntityFavorites`), `user_settings`, `user_roles`, `bunny_streams` by region (route media on the ascent list; auto-subscribed unless day 1's count shows over 2,000 rows in a region, then on demand; task 2.1 records the choice), `routes_to_tags` with its composite text id. Every synced table has a primary key (`routes_to_tags` a composite one), so no replica identity change is needed.

A region's guidebook arrives as one unit, so a screen opened before its region has synced once shows arriving, and once synced no screen of that region ever waits (the `sync/query-readiness` delta). Rule 2 of the remeasure is what checks that the first open is no worse than today.

The predicates are the whole boundary: RLS does not see the sync path. So the review loop runs with `+security` against the 39 cases in `src/lib/db/regionPolicies.test.ts` (deactivated membership, soft-deleted regions, `files.visibility`, content_removed rows), and D7 adds a test that runs on every `npm test`.

A sync-config change re-replicates the whole upstream before activating (20 to 90 s at trial size). Config deploys are separate from app deploys, and the service log's activation line is the signal.

### D4. Client schema generated from drizzle, not hand-written

`src/lib/powersync/schema.ts` is generated by a small script from `src/lib/db/schema.ts` for the tables the sync config names (snake_case columns, `nid` integer copies for every joined table because PowerSync's `id` is text and TanStack compares strictly, declared indexes for every column a `where` or join reads). A test pins the generated table list to `deployment/powersync/sync-config.yaml`. The trial hand-wrote only the block page's columns, which is where silent column drift would land across 44 trees.

### D5. Infra: beside zero-cache, its own name, its own secrets

`deployment/docker-compose.zero.yml` gains `powersync-prod` (`journeyapps/powersync-service:1.27.2`, `service.yaml` and `sync-config.yaml` bind-mounted read-only from `deployment/powersync/`) and `mongo-prod` (`mongo:7`, single-node replica set, WiredTiger cache capped at 1 GB, on an internal network, derived state, no backup). `nginx.zero.conf` gains a server block for `sync.grnyte.rocks` with `proxy_buffering off`, `proxy_read_timeout` over an hour and `proxy_http_version 1.1`: the existing block's 60 s read timeout would cut the sync stream every minute. The block is tested locally with `nginx:alpine` in front of `trial-ps-mongo` before it touches the box. Compaction: a sidecar service looping `sleep 3600` then `compact`, so the deploy owns it. `api.parameters.max_concurrent_connections` set deliberately (the trial's default returned 429 to 550 of 750 reconnecting devices).

Secrets: `POWERSYNC_*` through the same Bitwarden allowlist in `deploy-zero.yml` and `secrets.mjs`, `PUBLIC_POWERSYNC_URL` on Vercel. The Supabase HS256 secret as `client_auth.supabase_jwt_secret`. Prod Postgres: `create publication powersync for table ...` listing the synced tables, over the direct connection, never the pooler (`wal_level=logical` is already set for zero-cache). First the user reads `show max_replication_slots` and `pg_replication_slots`: two consumers must fit for the overlap release, and a slot whose consumer is down retains WAL on the capped disk.

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

## Risks / Trade-offs

- [nginx has never fronted the stream] → the block is proven locally against `trial-ps-mongo` with a 10-minute idle connection before the VPS deploy.
- [Replication slot headroom on prod] → read before day 1; if only one slot is free, the overlap release shortens to days with a forced service-worker reload.
- [Status events on iOS] → polling while visible on every platform; the user's day-2 iPhone drive is the proof.
- [The row shim hides column drift] → the generated schema (D4) and one mapper snapshot test per migrated entity.
- [Raw SQL scans on a phone] → the EXPLAIN guard (D7) on every raw statement; none ships without it.
- [Two engines on the branch during the milestone] → the measurement switch (D6); the branch is never released in that state.
- [`EventMeta`'s "last edited by" line on area, block and route pages reads `listEvents` through `eventList`] → it stays on Zero for the milestone and becomes a server read in R1.
- [The 1,000 parameter-lookup cap] → every stream is single-table and region-level; `members` is a subquery over region_members, which the trial measured at 14 lookups for a two-region user.

## Migration Plan

Milestone only; nothing deploys to users.

1. Infra on the VPS beside zero-cache, service reachable at `sync.grnyte.rocks`, syncing prod data to a test account.
2. Branch `feature/powersync` in a fresh worktree off `develop`; trial code ported by file, not merged.
3. Reads and shell land per task group with a review loop after reads.
4. Remeasure on the user's iPhone (home-screen app, preview build over Tailscale, switch on): rule 1 cold start and reopen to map-ready, rule 2 screens, rule 8 one-hour soak, each against today's Zero build. Pass means no worse.
5. Go/no-go. On no-go, the VPS services are removed and the branch is kept.

Rollback at this stage is deleting two containers and one publication.

## Open Questions

- Whether `bunny_streams` auto-subscribes region-wide or stays on demand: decided by its row count per region, which the user reads from prod on day 1. Either way the stream exists.
- Whether `members` stays a subquery stream or becomes region-level with a `region_members` join on the device: the trial measured the subquery at 14 lookups for two regions, so it is fine until a region with many members shows otherwise.
