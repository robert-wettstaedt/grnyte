# Proposal

## Why

The sync engine trial (local `docs/sync-engine-evaluation.md`, trials 1 to 3 and the two iPhone checks, 2026-11-01 to 11-07) ended with the user deciding to move from Zero to PowerSync: the offline guidebook is essential, it is what makes Zero's per-client server cost grow (about 16x more server memory per device, 10.5 GiB at 750 devices), and the planned Expo app must start on the final engine. The migration is 20 to 34 Claude-days, so it ships as a milestone plus three releases. This change is the milestone: the part the remeasure needs. It ends with a go/no-go for the rest. As planned on 2026-11-07, the go/no-go was rules 1, 2 and 8 rerun on an iPhone. Revised 2026-11-14 (design D13): field users are expected to move to the native app, so the PWA switches to PowerSync only on the day the native app is public, and the go/no-go rests on the desktop PWA in Chrome, the Expo spike and server cost, with the iOS numbers recorded as costs.

## What Changes

- A self-hosted PowerSync service (MongoDB bucket storage) runs on the VPS beside zero-cache at `sync.grnyte.rocks`, configured from `deployment/powersync/`, deployed by the existing VPS workflow, with an hourly compaction job and a dedicated nginx block for the long-lived sync stream. Supabase prod gets a `powersync` publication; the replication slot headroom is checked first.
- Region-level sync streams replace the preload classes: every signed-in device syncs every region it belongs to in full (guidebook tables, everyone's ascents, members, favorites, reference data). The field-device gate, the 3,000-route threshold and the `offlineData` override go. The stream predicates become the tenancy boundary for synced reads (RLS does not see the sync path), with a membership test that runs on every `npm test`.
- The client keeps the data in PowerSync's SQLite (one file per account), read through TanStack DB live queries, and reshaped into the row shape the existing mappers expect. The 46 resource factories keep their signatures and `QueryResource` contract, so the 102 screen imports and `QueryState`, `summaryOf`, `Form`'s `waitFor` do not change.
- The sync shell is rebuilt over PowerSync's status: `z.svelte.ts`, `offline.ts`, `coverage.ts`, `ttlSource.svelte.ts`, `authRecovery.ts`, `connection.ts` and the three sync stamps are replaced by one `db.svelte.ts` plus the resource adapter. The status bar, pills, `isOnline`, the cold-store copy and the account-switch wipe keep their observable behaviour. The status comes from PowerSync's listener on every platform, iOS included (design D2).
- The guidebook screens read from PowerSync: block, area, route, ascent (including other members' profiles), the explore map and its filters, search and recent lists, favorites and save counts, members, grades and role permissions. Entity modules touched: area, ascent, block, favorite, firstAscensionist, file, geolocation, grade, region, rolePermission, route, topo, user. Tables synced: areas, ascents, blocks, favorites, files, first_ascensionists, geolocations, grades, region_members, regions, role_permissions, routes, routes_to_first_ascensionists, routes_to_tags, topo_routes, topos, users, user_settings, user_roles, bunny_streams.
- Feed, inbox, comments, reactions, reports, notifications and every write stay on Zero on the branch for this milestone. For the remeasure, a runtime switch (`$env/dynamic/public`) starts only PowerSync, and those screens show their offline state; the engine-seam change replaces the switch with the engine switch (design D13).
- Zero's local IndexedDB is dropped once on the first PowerSync boot of a device.
- The remeasure: the iOS PWA's cold start (rule 1), screens (rule 2) and soak (rule 8, dropped and never run) are recorded as known costs or left unmeasured, not used as the bar. The bar is design D13's: the desktop PWA in Chrome, the Expo spike and server cost.
- **BREAKING** (deploy-time, not this milestone's deploy): nothing in this milestone changes a URL, a remote function export or `manifest.id`. The branch is not released on its own: production stays on Zero until the native app is public, and the cutover happens that day, with every Zero server piece left in place for one release so already-loaded tabs keep syncing through zero-cache and a Vercel rollback to the Zero build still works.

## Non-goals

- Offline writes and the intent queue: a separate PR after the migration (the id, upload and checkpoint decisions for it are recorded in design D11).
- Writes of any kind: this milestone does not move the 59 mutators. Both mutate paths (`/api/sync/mutate` beside `/api/zero/mutate`, one handler) are R1.
- Feed, inbox, comments, reactions, reports, notifications and push: R1 as server reads, R2 as local windows.
- Zero removal (33 files, 2 routes, 10 secrets, DNS, slot, schemas, 3 packages, `generate:zero`, skills and AGENTS.md): R3.
- Moving shared code towards `packages/shared`, the Expo app, and MongoDB backups beyond "derived state, not backed up".
- Rewriting the mappers to PowerSync's row shape; the shim stays until R3.

## Capabilities

### New Capabilities

- `sync/region-sync`: what a signed-in device holds locally (every region it belongs to, in full), how membership gates it, how a device catches up after time away, and what a second account on the same device sees.

### Modified Capabilities

- `sync/query-readiness`: a guidebook screen opened before its region has synced once shows arriving; once synced, reopening does not wait, except an online claim of "none", which waits for its stream's confirmation (design D13). The resume requirement changes (design D14): after more than a few seconds away, the connection is re-established even if it still works, since PowerSync cannot tell, and the application says it is catching up until current data arrives; a catch-up that never completes says not syncing. Verified on the iOS PWA in the Simulator (task 8.14) and on the native app at the pre-release checkpoint.
- `sync/offline-registry`: the kept classes (always, field, personal, excluded) are replaced by region streams. Everything in the reader's regions is kept on every device, desktop included; reference data still arrives first.

## Impact

- New: `deployment/powersync/` (service and stream config), a compose service pair on the VPS, `POWERSYNC_*` secrets through the Bitwarden allowlist, `PUBLIC_POWERSYNC_URL` on Vercel, a `powersync` publication on prod Postgres, a local PowerSync plus MongoDB compose for the dev stack, `src/lib/powersync/` (client schema, db, resource adapter, SQL helpers), the TanStack DB and PowerSync packages already in `package.json` from the trial.
- Changed: `src/lib/entities/*/resources.svelte.ts` for the 13 entity modules above, `src/lib/zero/resource.svelte.ts` (phases unchanged, source swapped), `src/lib/state/{online,pill,sync,device}.svelte.ts`, `src/lib/state/pwa/wipe.ts`, `src/routes/(app)/+layout.{ts,svelte}`, the status bar (`src/lib/components/StatusBar/*`, resume state, D14), `src/lib/powersync/resume.ts` (new), `src/lib/map/explore/exploreData.svelte.ts`, `src/lib/components/EntitySearch/*`, `src/lib/components/Markdown/lib/references.svelte.ts`, `vite.config.ts`, `src/sw.ts` precache, `e2e/support.ts`, `ci/shim.sql`, `.github/workflows/deploy-zero.yml`.
- Deleted: `src/lib/zero/{offline,coverage,authRecovery,connection}.ts`, `src/lib/zero/ttlSource.svelte.ts`, `src/lib/logging/resumeLog.ts`, `src/lib/zero/guidebook.ts` (the ten guidebook queries), their tests, the trial routes (`t3`, `t3soak`), `isFieldDevice` and the `offlineData` override. `mobile/` and `trial3-setup/` go to an archive branch.
- Kept as type-only sources until R3: `src/lib/entities/*/queries.ts` for the migrated entities, `src/lib/zero/zero-schema.gen.ts`, `src/lib/zero/types.ts`. Since design D13 the engine-seam change makes the Zero side live again behind the seam until the cutover, restoring from `develop` what this branch deleted.
- Tests: the deleted modules' suites removed (`tenancy`, `offline.drift`, `composite`, `ttlSource.svelte`, `authRecovery` among them), a stream membership suite added, `resource.svelte.test.ts` and `offlineRules.test.ts` rewritten over PowerSync status, one Playwright "outsider sees nothing" smoke, EXPLAIN guards for the hot SQLite queries.
- Prod facts the user reads on day 1: `max_replication_slots` and `pg_replication_slots` on prod Postgres, `free -m` and `nproc` on the VPS.
