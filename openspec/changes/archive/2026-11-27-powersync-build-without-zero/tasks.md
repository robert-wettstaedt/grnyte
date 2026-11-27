# Tasks

## How the tests are written

A test comes before the code it needs and is seen red first. The guard is tested through its public `resolveId`, as `vite.sync-engine.test.ts` already does. The removed client start has no unit test of its own: its evidence is the build-output probe and the runtime probe (design D4), each run with a control that shows it can see the client.

## 1. The guard refuses the client outright (D2)

- [x] 1.1 `vite.sync-engine.test.ts`: replace the "passes a listed importer" case and the `it.each(ZERO_CLIENT_IMPORTERS)` stale-entry case with: refuses `$lib/zero/z.svelte` from `/app/src/lib/state/engine.powersync.ts` and from any other module, naming the importer; refuses `zero-svelte`; passes `@rocicorp/zero` and an unrelated module. Run: the first case is red against today's list.
- [x] 1.2 `vite.sync-engine.ts`: delete `ZERO_CLIENT_IMPORTERS`; `zeroClientGuard()` refuses every resolution to `/src/lib/zero/z.svelte.ts` and the `zero-svelte` specifier. Doc comment: one line. Run 1.1 green.
  - Apply note (P7): the guard cannot see `new Zero(...)` from `@rocicorp/zero`, which stays allowed; the runtime probe (6.5, `window.__zero`) and the build probe (6.1, `__zero`) are what catch that. Say so in the guard's doc line.

## 2. The PowerSync build starts no Zero client (D1)

- [x] 2.1 `src/lib/state/engine.powersync.ts`: drop the `initZero` import and call, and the sentence of `start()`'s doc comment about the client it still starts. Verify: `PUBLIC_SYNC_ENGINE=powersync npm run build` passes with the guard of 1.2 (it fails before this edit: run it once first, then edit).
- [x] 2.2 `src/lib/state/engine.powersync.svelte.test.ts`: delete the `zero-svelte` mock if nothing reaches it now (grep that the test still passes without it; a mock of an unreached module is dead), and drop "the Zero client" from the edges comment on line 9.

## 3. `initZero` loses `preload` (D3)

- [x] 3.1 `src/lib/zero/z.svelte.test.ts`: drop the `preload: false` row of "a client unconnected for ten seconds" and "by default" from the next test's name. The remaining single case becomes a plain `it`, without the `options` and `whose` columns.
  - Apply note (P5): also delete the test "with the preload off starts no preload, no store probe and tracks nothing" (line 83), which calls `initZero(..., { preload: false })`; otherwise 3.2 fails typecheck and at runtime.
- [x] 3.2 `src/lib/zero/z.svelte.ts`: delete the `{ preload }` parameter and its comment; each `if (preload)` becomes unconditional. Run 3.1 and `npx vitest run --project browser src/lib/zero` green.

## 4. e2e prerequisites (D4, D6)

- [x] 4.1 `e2e/support.ts`: in a PowerSync run, zero-cache is not a prerequisite; in a Zero run it still is. Replace the stale comment on `POWERSYNC` with one line. `ZERO` loses its `export` (only this file reads it).

## 5. Security review (D5)

- [x] 5.1 Pin `git rev-parse HEAD` after sections 1 to 4 are committed. Spawn one fresh reviewer (`model: opus`) with the three surfaces, the change-marker triggers and the questions of D5, and the instruction to report each finding with `file:line` and a failure case.
  - Apply note (P10): add to the questions how long a signed-out or "signed out elsewhere" session keeps syncing: the write route and `readQuery` check the session is live, the PowerSync service checks only signature, audience and expiry (Zero's `get-queries` has the same gap).
- [x] 5.2 Rule on every finding in `review.md`: fixed here or refuted with evidence; none is deferred, as every surface is live in production (D5). A finding whose fix changes `sync-config.yaml` or the schema goes to the user first, with the containment question (D5). Each fix: a test seen red first, then the fix, squashed into the commit it belongs to; a stream fix also extends `streams.server.test.ts`.
  - Apply note (P14): an app-code fix reaches production only when `develop` reaches `main`; at ruling ask the user to hotfix `main` or contain it, as D-2 asks for a stream fix.
- [x] 5.3 A fix that changes the schema or a trigger: agree the migration number with the other branches before `generate:drizzle`, and test it on a throwaway Postgres through `ci/local.sh` (never the shared dev DB). A stream fix: ask the user to restart the dev PowerSync service from a checkout that has it before section 6. (None arose: the audit found no schema, trigger or stream defect.)
  - Apply note (P20, major, convergence): `ci/local.sh` is DB-only, and section 6 runs on the shared dev DB, which never gets this branch's migration. So a schema or trigger fix gets its end-to-end evidence on a throwaway app stack instead (own Postgres migrated with the fix, the app on its own port, and for a PowerSync check a PowerSync service pointed at that Postgres; memory `throwaway-app-stack`). If that stack cannot carry PowerSync, say so in `review.md` and ask the user before merging.

## 6. Evidence on both builds (D4)

After section 5, so every security fix is in what the e2e runs and drives check.

- [x] 6.1 Build-output probe: `PUBLIC_ZERO_URL=<unique marker> npm run build` then grep `build/client` for the marker and for `__zero` (both must be found: control); `PUBLIC_SYNC_ENGINE=powersync PUBLIC_ZERO_URL=<marker> npm run build` then grep for both (both must be absent). Record the counts in `review.md`.
- [x] 6.2 Check the dev PowerSync service runs `develop`'s stream config: compare the mounted `sync-config.yaml` (`docker inspect grnyte-powersync-powersync-1`) with this checkout's. If it differs, ask the user to restart it from an up-to-date main checkout.
  - Apply note (P21): after a stream fix (5.3), restart it from the checkout whose config is under test (this one), not the main checkout.
- [x] 6.3 e2e on the Zero build (own vite port, shared zero-cache), every spec except `prod-*`. Record pass/fail per spec.
- [x] 6.4 e2e on the PowerSync build: app on its own port with `PUBLIC_SYNC_ENGINE=powersync` and `PUBLIC_ZERO_URL` at a closed port, PowerSync on :58100. Same specs. Record pass/fail per spec; a flake is rerun once and reported.
- [x] 6.5 Runtime probe on the PowerSync build: over sign-in, feed, an ascent log, an inbox open, the network log shows no request or WebSocket to the zero-cache origin and `window.__zero` is undefined. Control: the Zero build shows the WebSocket and `window.__zero`.
- [x] 6.6 Drives on both builds at 375x667 and 1280x800 (design D4 list): guidebook read, ascent log, a form save, favorite and emoji toggles, feed pill from a second account's write, inbox and unread count, a thread receiving another member's comment, report button, sign-out wipe. Revert every write on the shared dev DB. Close the pages and say "browser is free".

## 7. Records (D6)

- [x] 7.1 `CONTEXT.md`: "engine switch" and "zero-cache / Zero client" as in D6.
- [x] 7.2 `AGENTS.md`: the `ZERO_CLIENT_IMPORTERS` sentence as in D6.
- [x] 7.3 Grep the repo (excluding `openspec/changes/archive`) for `ZERO_CLIENT_IMPORTERS`, "still starts", "local preview", "preview-only" and `preload: false`; each hit outside this change's own folder is fixed or is an archive.

## 8. Verification sweep

- [x] 8.1 Over the touched paths: `npx prettier --write`, `npx eslint`, `npx vitest run --project server vite.sync-engine.test.ts` (or the project that runs it), `--project browser` for `src/lib/zero` and `src/lib/state`, then `./node_modules/.bin/svelte-check --tsconfig ./tsconfig.json` (or `npm run check` with no dev server running).
- [x] 8.2 `npm run lint:unused`, `npm run lint:duplication`, `npm run lint:health`. A finding gets fixed, never baselined.
- [x] 8.3 Both builds: `npm run build` and `PUBLIC_SYNC_ENGINE=powersync npm run build`.
- [x] 8.4 The app driven at 375x667 and 1280x800 on both builds (task 6.6).

## 9. Before archive

- [x] 9.1 Issue-sync gate from the worktree root, with the `milestone-close` worktree's tsx and gate: `../milestone-close/node_modules/.bin/tsx ../milestone-close/scripts/issue-sync/cli/gate.ts powersync-build-without-zero`. Archive only on "ready"; the archive commit's subject ends "(closes #1183)".
- [x] 9.2 Milestone `roadmap.md`: the R1 row says merged, and the PWA cutover row lists the release prerequisites of the proposal as its preconditions.

## Release prerequisites

The user's, before any deployment builds PowerSync; they gate a deployment, not this merge, so they live as the PWA cutover row's preconditions in the milestone `roadmap.md` (task 9.2): production's `powersync` publication lists the three tables; `develop`'s stream config deployed through the VPS workflow (a dispatch redeploys the whole `deployment/` tree and restarts the stack, so check `git diff origin/main origin/develop -- deployment/` first); `PUBLIC_POWERSYNC_URL` set, a production-data preview taking production values for one branch only (`deployment/SECRETS.md`) and losing them and its deployments after its check.
