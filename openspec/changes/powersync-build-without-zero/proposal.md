# Proposal

## Why

Issue 1183, the closing package of R1 (issue 1145). Packages 1177 to 1182 moved every read and write of the PowerSync build off the Zero client: guidebook, profiles and search from PowerSync, writes to the write route, feed, inbox and comments as server reads that follow their change markers. One line still starts Zero: `engine.powersync.ts` calls `initZero(session, { preload: false })`, and the guard `zeroClientGuard` lists that file as the last allowed importer. Nothing in the build reads that client, but it still opens a socket to zero-cache, so a PowerSync build cannot run without zero-cache, and the spec (`sync/engine-switch`) keeps the build a local preview until it starts no Zero client at all.

R1 also owes a security review of the three surfaces it added (the stream predicates, the write route, the server reads), both builds' e2e suites and drives, and specs and docs that describe the PowerSync build as it now is.

## What Changes

- The PowerSync build starts no Zero client: `engine.powersync.ts` drops `initZero` and its import. Nothing else in the build reaches the client (the guard proves it today).
- The guard holds it absolutely: a PowerSync build fails when any module imports the Zero client module or the `zero-svelte` package. The list of remaining importers (`ZERO_CLIENT_IMPORTERS`) and its stale-entry test go, since a list that may only shrink is now empty.
- `initZero` loses its `preload` option: its only `false` caller is gone, and the Zero build always passed the default.
- The e2e prerequisites stop asking a PowerSync run for zero-cache, so the suite runs on a PowerSync build with zero-cache down.
- The e2e suite and the R1 drives run on both builds; the PowerSync build is shown to open no connection to zero-cache.
- A security review of the stream predicates (`deployment/powersync/sync-config.yaml`), the write route (`/api/sync/mutate`) and the server reads (`readQuery`), with its findings ruled on in this change.
- Specs and docs: `sync/engine-switch` says the PowerSync build starts no Zero client and may be deployed as a preview, while production stays on Zero until the cutover; `sync/shell` rewords its scenario about a Zero client in the PowerSync build; `CONTEXT.md` ("engine switch"), `AGENTS.md` (the guard sentence) and the milestone roadmap's R1 row follow.

Nothing is client-breaking: no URL, remote function export, mutator, route, schema or `manifest.id` changes. Production builds Zero, whose code changes only by the removed `preload` option it never set, so production behaves as before and open tabs are unaffected.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `sync/engine-switch`: "The PowerSync build is a local preview until it runs without Zero" becomes two: "The PowerSync build runs without Zero" (it starts no Zero client and needs no zero-cache) and "Production builds Zero until the cutover" (a preview may build PowerSync, on production data only as one branch's preview removed after its check). "A PowerSync build takes on no new use of the Zero client" becomes "A PowerSync build carries no Zero client": no module may import it, with no list.
- `sync/shell`: in "PowerSync alone decides the connection state in its build", the scenario "The Zero client fails" now says zero-cache going down leaves the app online, as the build starts no Zero client.

## Non-goals

- Deleting Zero code, packages, `queries.ts`, the generated Zero schema, zero-cache or `/api/zero/*`: R3, one release after the cutover. The PowerSync build still uses the Zero query definitions on the app server (server reads) and the server mutators (write route).
- The cutover itself (the PWA cutover row, design D17): switching production's `PUBLIC_SYNC_ENGINE`, the real-iPhone first sync on a preview. This change only makes a preview deployment allowed.
- New fixes to the Zero build. Its only change is the removed `preload` option.
- The `/settings/errors` resume log: Zero-only instrumentation of a dead socket, already never written in the PowerSync build (it records only with Zero's ping tightening on). R3 deletes it with Zero.
- Making the feed, inbox or comments local (R2).
- Running the e2e suite on the PowerSync build in CI: it runs locally, as AGENTS.md already says. CI keeps building both engines.

## Release prerequisites (not code; they gate a PowerSync deployment, not the merge)

- Production's `powersync` publication lists `content_reports`, `region_counters` and `user_counters`. Migration 0153 adds them only where the migrating role owns the publication, and otherwise only warns (`insufficient_privilege`).
- The stream config of `develop` is deployed to the VPS through the VPS workflow (`.github/workflows/deploy-zero.yml`, run on a push to `main` or by dispatch), and the service has finished reprocessing it.
- `PUBLIC_POWERSYNC_URL` is set on the deployment that builds PowerSync. A preview on production data takes production values for one branch only, and they and its deployments are removed after its check.

A stream-config fix from the security review is not a prerequisite to wait for: the streams are open to production tokens today, so it ships by dispatch as soon as it merges.

## Impact

- Sync: `state/engine.powersync.ts`, `zero/z.svelte.ts` (the `preload` option), `vite.sync-engine.ts` and its test.
- E2E: `e2e/support.ts`.
- Tables, routes, entity modules, remote functions, copy: none, unless the security review finds something (then named in `review.md` and ruled there).
- Records: `openspec/specs/sync/engine-switch`, `openspec/specs/sync/shell` (through the deltas), `CONTEXT.md`, `AGENTS.md`, `openspec/changes/migrate-sync-to-powersync-milestone/roadmap.md`.
- Size: 4 to 6 hours wall clock, most of it the two e2e runs, the drives and the security review.
