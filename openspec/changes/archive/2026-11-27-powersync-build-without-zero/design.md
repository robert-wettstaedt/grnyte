# Design

## Context

See proposal.md for why. The code facts this design rests on (read 2026-11-27 at `d985fee1`):

- `src/lib/state/engine.powersync.ts` ends `start()` with `initZero(session, { preload: false })` and imports `initZero` from `$lib/zero/z.svelte`. Its doc comment already says "Nothing in this build reads the Zero client it still starts."
- `vite.sync-engine.ts`: `ZERO_CLIENT_IMPORTERS = ['src/lib/state/engine.powersync.ts']`; `zeroClientGuard()` refuses an import of `/src/lib/zero/z.svelte.ts` from any other module in a PowerSync build. `vite.sync-engine.test.ts` tests the refusal, the pass for a listed importer, and (`it.each(ZERO_CLIENT_IMPORTERS)`) that each listed file still imports the client.
- The only module importing `zero-svelte` is `z.svelte.ts`; the only reader of `PUBLIC_ZERO_URL` is `z.svelte.ts` (line 469).
- With `preload: false`, `initZero` still: builds a `Z` client (a socket to `PUBLIC_ZERO_URL`, its own IndexedDB replica, and `window.__zero`, which Zero's constructor always installs), sets `instance` so `getZ()` answers, registers `onClientStateNotFound` (`forgetSynced()` then `location.reload()`, `z.svelte.ts:464-466`), subscribes to its connection state for `armSyncBarrier` (sets `syncCaughtUp`) and `noteConnectionForResume`, and in dev installs `window.__grnyte`. `noteConnectionForResume` returns early there: `openResume` is set only in `tightenPing` (`z.svelte.ts:424`), which is installed only with `preload` on (line 93), so the resume log is already never written in the PowerSync build. It skips `trackSyncFor`, `reportConnectionState`, the ping tightening, the store probe and every preload.
- None of those reach a PowerSync screen: the online flag comes from `powersync/db.svelte.ts` (`reportConnectionState`, line 398); `syncCaughtUp` resolves to the twin `source.powersync.svelte.ts` (`() => true`); nothing in PowerSync code reads `window.__grnyte`.
- `initZero`'s other callers are in `state/engine.ts` (the Zero build), both with the default `preload`.
- `state/pwa/wipe.ts` imports `dropAllDatabases` from `@rocicorp/zero`, so a sign-out in either build drops a Zero replica left on the device. That import is the Zero package, not the client module, and must stay reachable (a device that ran the Zero build before the cutover keeps its replica until wiped).
- `e2e/support.ts` requires zero-cache on `E2E_ZERO_URL` (default :4848) in every run, and PowerSync on :58100 when `PUBLIC_SYNC_ENGINE=powersync`. Its comment says writes, the feed and comments still go through zero-cache in a PowerSync build; that stopped being true with 1177 to 1182.
- The PowerSync build's server work runs on the app server, never through zero-cache: `readQuery` (`src/lib/zero/read.remote.ts`) runs a Zero query definition in a Drizzle transaction under `applyRls`; `handleSyncMutate` (`src/lib/zero/server/syncMutate.server.ts`) runs a server mutator in `dbProvider.transaction`.
- CI (`.github/workflows/ci.yml`) builds both engines on every push; `PUBLIC_ZERO_URL: foobar` is set for both.

## Goals / Non-Goals

**Goals:**

- A PowerSync build that opens no connection to zero-cache, held by a guard with no exceptions.
- Evidence that both builds still pass the e2e suite and the R1 drives.
- A security review of R1's three new surfaces, ruled on before merge.

**Non-Goals:** see proposal. Design-level: no change to `readQuery`, the write route, the stream config or the schema unless the security review finds a defect (D5).

## Decisions

### D1. Delete the call, not the module

`engine.powersync.ts` drops the `initZero` import and its call; the doc comment of `start()` drops the sentence about the client it still starts. `z.svelte.ts` stays for the Zero build until R3.

Lost in the PowerSync build, on purpose: the dev-only `window.__grnyte` bench handle (it benchmarks Zero queries; the drive probes in D4 do not rely on it), `getZ()` (unreachable there, the guard proves it), and the reload on `onClientStateNotFound` (a Zero replica problem could reload a PowerSync tab; losing it removes a risk). The resume log is unaffected: it is already never written in this build.

Alternative rejected: keep a no-op `initZero` twin. It would keep an import edge for the guard to allow, which is what this package removes.

### D2. The guard refuses the client outright

`ZERO_CLIENT_IMPORTERS` and its stale-entry test go. `zeroClientGuard()` refuses, in a PowerSync build, any import that resolves to `/src/lib/zero/z.svelte.ts` and any import of the `zero-svelte` package (matched on the specifier, as `zeroGuard` matches `@powersync/`), naming the importer. `zero-svelte` is added because it is the client itself: a module that builds a `Z` directly would bypass the first check. `@rocicorp/zero` is NOT refused: the PowerSync build uses its query definitions (server reads), `dropAllDatabases` (wipe) and its error types; R3 removes it.

Tests (`vite.sync-engine.test.ts`): refuses `$lib/zero/z.svelte` from `engine.powersync.ts` (the former allowed importer) and from any module, refuses `zero-svelte`, passes `@rocicorp/zero` and an unrelated module. The refusal of the former importer is the test that goes red against today's list.

### D3. `initZero` loses `preload`

The option existed only for the PowerSync build. Every `if (preload)` becomes unconditional and the `{ preload }` parameter goes. The Zero build always passed the default `true`, so its behaviour is unchanged. `z.svelte.test.ts` (line 58) tests "a client unconnected for ten seconds" for both options; its `preload: false` row goes and the one-case `it.each` becomes a plain `it`, and the test "preloads and tracks the sync state by default" loses "by default".

### D4. Evidence on both builds

- **Build output (point of use):** build each engine with `PUBLIC_ZERO_URL` set to a unique marker string, and grep `build/client` for the marker and for `__zero` (Zero's constructor expose). The Zero build contains both (control); the PowerSync build contains neither. This checks the shipped output, not the guard's own logic. A package name is no probe: minified chunks keep none.
- **Runtime:** on the PowerSync build in the browser, the network log over a session (sign-in, feed, a write, an inbox open) shows no request or WebSocket to the zero-cache origin, and `window.__zero` is undefined (Zero installs it when a client starts).
- **e2e:** the suite (every spec except `prod-*`) on the Zero build, and on the PowerSync build with zero-cache unreachable for the app (`E2E_ZERO_URL` is not checked in a PowerSync run; the app is started with `PUBLIC_ZERO_URL` pointing at a closed port so a stray client could not quietly connect to the shared one).
- **Drives:** both builds at 375x667 and 1280x800 over the R1 surfaces: guidebook read, ascent log, a form save, favorite and emoji toggles, feed with the "N new" pill from a second account's write, inbox with unread count, a comment thread receiving another member's comment, report button, sign-out wipe. Writes go to the shared dev DB and are reverted (this change has no schema change; a schema or trigger fix from the security review is tested on a throwaway Postgres through `ci/local.sh` first, task 5.3). The e2e runs and drives come after the security review, so they cover its fixes.
- The dev PowerSync service must run the stream config of `develop` (it reads `deployment/powersync` of the checkout that last started it, only at start). Checked before the drive by comparing the mounted `sync-config.yaml` with this checkout's.

### D5. Security review: three surfaces, one fresh reviewer

All three surfaces are live in production today, whatever engine the app is built with: `sync.grnyte.rocks/` proxies to the PowerSync service (`deployment/nginx.zero.conf`), which accepts any JWKS-signed token with `aud: authenticated` (`deployment/powersync/service.yaml`), so any production user can open the streams with their own access token; `/api/sync/mutate` and `readQuery` have no engine gate and ship in the Zero build. A confirmed finding is therefore a production exposure now, not after the cutover.

A reviewer subagent (`model: opus`), fresh, given the code paths and the questions below, not this design's expectations. It reads at a pinned commit and reports findings with `file:line` and a failure case. Each finding is ruled on in `review.md`: fixed in this change, or refuted with evidence. No confirmed finding is deferred to its own issue. A fix to the app code ships with this merge; a fix to `sync-config.yaml` ships by dispatching the VPS workflow once merged (the release prerequisites in proposal.md and tasks R.1 to R.4). A fix to the app code reaches production only once `develop` reaches `main`. Until a fix ships, the user decides whether to hotfix `main` (app code) or contain it (for example, deny `location /` on `sync.grnyte.rocks` in `nginx.zero.conf`); that choice is raised before ruling.

Questions to answer (not conclusions):

- **Stream predicates** (`deployment/powersync/sync-config.yaml`, pinned by `src/lib/powersync/streams.server.test.ts`): every query is bounded by `auth.user_id()` or active membership, and refuses a contested signup. What a removed or deactivated member keeps (the `members` stream deliberately includes former members' `users` rows: which columns of `users` does `SELECT *` send to co-members, and does any of them exceed what Zero's `users` query exposed?). `files` ignores `visibility` for members: matches Zero's read? `content_reports` only the caller's own, in an active region. Is any table synced whose RLS read policy is narrower than its stream predicate?
- **Write route** (`src/routes/api/sync/mutate/+server.ts`, `syncMutate.server.ts`, `mutationCaller` in `mutate.server.ts`): Bearer only, never a cookie (CSRF); an expired, revoked or contested token; the mutator lookup refuses namespaces and inherited names; a write id another caller used answers 409 without leaking the stored result; unbounded `args` or body size; error bodies leak no internals; `afterCommit` tasks run only after commit.
- **Server reads** (`src/lib/zero/read.remote.ts`, the auth hook change in `src/lib/hooks/auth.server.ts`): the `as` check against the live session; the query lookup refuses non-queries; RLS applied before the run and the region filter from `locals`, never from the request; a caller-chosen `limit` against the 10-connection pool beyond the 10 s statement timeout; error bodies.
- **Change markers** (`region_counters`, `user_counters`, their triggers in migration 0153): a co-member learns only that the region moved; a user's counter reaches only that user.

### D6. Records

- `CONTEXT.md` "engine switch": `zero` (unset, every deployment) becomes: `zero` (unset; production until the cutover) or `powersync` (preview deployments and local). "zero-cache / Zero client": the sentence that the PowerSync build still starts a client and `ZERO_CLIENT_IMPORTERS` lists what is left becomes "The PowerSync build starts no Zero client; it still runs Zero's query definitions and server mutators on the app server until R3."
- `AGENTS.md`: the sentence "`ZERO_CLIENT_IMPORTERS` (`vite.sync-engine.ts`) only shrinks." becomes "A PowerSync build fails on any import of the Zero client (`zeroClientGuard`)."
- `e2e/support.ts`: the stale comment and the zero-cache check follow D4.
- Milestone `roadmap.md`: the R1 row gains "merged (1183)" only at archive time, with the release prerequisites as the PWA cutover row's preconditions; line 18's "except the preview-only PowerSync build until R1" follows the new preview rule.
- A preview that builds PowerSync against production data is a dogfood build: production values go onto that one branch's previews only on purpose, through the documented procedure (`deployment/SECRETS.md`, "Prod values for one branch's previews"), and are removed after, with that branch's preview deployments deleted (values are inlined at build time, so removing the env entry alone leaves them live). The spec states the rule; the release prerequisites carry the steps.

## Reads, writes, remote functions

Unchanged. Reads in the PowerSync build: PowerSync collections and twins for synced tables, `readQuery` server reads for the rest. Writes: server mutators through the write route. Remote functions: none added or changed. No schema change, no backfill.

## Risks / Trade-offs

- [A Zero-only side effect of `initZero` turns out to be load-bearing in the PowerSync build] → D4's drives cover every R1 surface with the client gone; the facts above list each side effect and its PowerSync replacement.
- [The security review finds a stream predicate defect] → it is live in production already (D5): any production user's token opens the streams on `sync.grnyte.rocks`. Fixed in this change and shipped by dispatching the VPS workflow; containment until then is the user's call.
- [e2e on the PowerSync build is flaky on first sync] → the WebKit first-sync stall is fixed (memory `powersync-safari-first-sync`); Playwright runs Chromium. A flake is rerun once and reported, never skipped.
- [A device that ran the Zero build keeps its Zero replica after the cutover] → `wipe.ts` still drops it on sign-out; clearing it on the first PowerSync start is the cutover row's question, not this package's.

## Open Questions

- For the user: the spec allows a preview deployment to build PowerSync now, under the dogfood rule above, because the D17 real-iPhone check needs one. The alternative keeps every deployment on Zero until the cutover row decides, and moves the preview permission there.
