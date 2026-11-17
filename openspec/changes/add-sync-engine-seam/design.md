# Design

## Context

See proposal.md for why. `feature/powersync` (the `migrate-sync-to-powersync-milestone` change) rewrote the Zero reads in place: 13 `entities/*/resources.svelte.ts`, about 40 shared modules and screens, 9 deleted Zero files. `$lib/powersync` is imported from shared code (`state/wipe.ts`, `state/global.svelte.ts`, `components/StatusBar`, `map/exploreData.svelte.ts`, `zero/z.svelte.ts`, `zero/resource.svelte.ts`, `routes/(app)/+layout.ts`), and `+layout.ts` imports `@powersync/web` directly. None of that can reach `develop` as it is, since production must keep running Zero unchanged until the PWA cutover (milestone design D17).

Reads: Zero queries in the Zero build, PowerSync live queries and raw SQL in the PowerSync build, both through the same entity functions. Writes: Zero custom mutators through `writes.ts` in both builds (R1 adds PowerSync's). Remote functions: unchanged, plus the new `syncHealth.remote.ts` read. Schema: no change, no backfill.

## Goals / Non-Goals

**Goals:**

- The Zero build behaves as `develop`: the same queries and the same screens. Every Zero-side code change is one D3 to D5 name (wrappers, widened filter types, calls into `state/engine.ts`, the preload input, one export, the branch's screens and neutral modules), and each is driven on the Zero build.
- The PowerSync build is `feature/powersync`'s reads, minus the measurement aids.
- Both engines type-check and unit-test on every PR.

**Non-Goals:**

- Tidying the Zero code while restoring it. Improvements go in their own changes.
- Sharing code between twins beyond what already is shared. A twin may repeat its Zero sibling's structure; R3 deletes the Zero side.

## Decisions

### D1. A twin replaces its sibling in the PowerSync build

A module that differs per engine gets a twin beside it, named by inserting `.powersync` before the last extension that the import specifier keeps: `area/resources.svelte.ts` (imported as `./resources.svelte`) has the twin `area/resources.powersync.svelte.ts`; `state/engine.ts` has `state/engine.powersync.ts`. The `.svelte.ts` ending stays, since runes compile only there.

In a `powersync` build or dev server (not under vitest, see D6) a small Vite plugin in `vite.config.ts` resolves an import of `X` to its twin when the twin exists and the importer is not PowerSync code. PowerSync code is every file under `src/lib/powersync/`, every twin, and their tests; it imports a twinned module by the twin's explicit path (`$lib/entities/area/resources.powersync.svelte`), never through the neutral path. That one rule makes svelte-check and vitest resolve exactly what the build resolves: screens and Zero code are typed against the Zero file, PowerSync code against the twins (for example `block`'s twin imports `areaChain`, which only `area`'s twin exports). A `zero` build has no such plugin, so `X` is `develop`'s file and no twin is ever bundled.

Alternatives: per-entity `resources.zero.svelte.ts` and `resources.powersync.svelte.ts` behind a neutral re-export renames every Zero file and adds a re-export per module, so the Zero side is no longer byte-for-byte `develop`; one folder per engine under `$lib/sync/` moves entity code out of `entities/<name>/` (AGENTS.md). Rejected both: the sibling rule keeps every Zero file at its path and adds only twins.

### D2. The Zero module's exports are the contract

`src/lib/powersync/twins.ts` holds one type assertion per pair: the twin's module type must be assignable to its Zero sibling's. `twins.test.ts` lists every `*.powersync.*` file under `src/` and fails when one has no assertion. Screens are type-checked only against the Zero file, so `twins.ts` is what holds a twin to every name and signature a screen uses; a twin may export more (helpers its sibling twins import explicitly, D1). No hand-written interface: Zero is what production runs, so its shape is the contract. Where the branch's entity functions differ from `develop`'s (the names, options and filter types D3 lists), the Zero side gains a wrapper or the twin accepts and ignores what it does not use, and `twins.ts` fails on any difference left.

### D3. Screens take the branch's code; the Zero side gets wrappers

Four screens call functions that exist only on the branch, or call them with other arguments (`(map)/explore/+page.svelte` `anyArea`, `AreaListItem.svelte` the slim route list, `CreateOnMap.svelte` `enabled`, `MergeSheet.svelte` `routeDetailList`). The screens take the branch's code, so the measured PowerSync numbers behind the go stay true. Each Zero module gains a wrapper under the new name that runs the exact Zero query the screen ran on `develop`: `anyArea` over `areaMapList`, mapped to the branch's `{ found }` rows; `routeDetailList` over `queries.listRoutes`, dropping the `sortOrder: 'asc'` the branch's merge sheet adds (on `develop` the merge sheet's query is unordered, and `listRoutes` orders only when both `sort` and `sortOrder` are set). A name that already exists on `develop` with another query is never reused: `routeMapList` is `develop`'s explore-map read (`queries.listRoutesForMap`), so `AreaListItem.svelte` calls a new `areaRouteList`, which is `routeList` on the Zero side and the branch's slim `routeMapList` read on the PowerSync side; an `enabled` option is accepted and ignored on the Zero side, so Zero still reads as it does today. `ProfileFavorites.svelte` and `ProfileView.svelte` keep `develop`'s calls with the offline-policy arguments (`isSelf`, `enabled`), which the PowerSync side accepts and ignores: the branch's calls compile against the Zero file and default `isSelf` to true, so another member's favorites would read as your own offline.

The Zero filter types `AreaListFilter`, `BlockListFilter` and `RouteListFilter` widen to `sort: 'createdAt'`, which their queries already take (`develop`'s `recent.svelte.ts` passes it to `queries.listAreas` and others directly).

Alternative: screens keep `develop`'s code and the PowerSync twins match the old names. Rejected (user): it drops PowerSync speed-ups that the go was measured with.

### D4. Engine parts of large shared modules: twin the module, or one input

- One app-level seam, the twinned `state/engine.ts`. It exports `start(session, supabase)` (the start-up moved out of `routes/(app)/+layout.ts`: `develop`'s `initZero(session)` call on the Zero side; on the PowerSync side PowerSync, with the branch's token getter from `supabase` and its dev fallback to `localhost:58100`, plus Zero without the guidebook preload, since writes, feed, inbox and comments still need Zero), `clearLocal` (sign-out; a no-op on Zero), `downloadRefused` (whether the PowerSync service refused the download, one input of the cold-store decision in `state/global.svelte.ts`, which decides if the app may open with an empty local store; `false` on Zero; the other input, `localStoreWarm`, is `state/sync.svelte.ts`'s, already `false` on Zero), and `resume` (the status bar's resume input: `'idle'` on Zero, PowerSync's resume state on the twin; the connection stays Zero's in both builds). `state/wipe.ts`, `state/global.svelte.ts` and `StatusBar.svelte` stay one file each and call these, so a `develop` fix to sign-out or the cold-store decision cannot miss a copy.
- The branch's `powerSyncOnly()` switch had two sides at each use. The PowerSync build keeps Zero running for writes, the feed, the inbox and comments, as the branch did in that two-engine mode: the online signal and the status bar's connection stay Zero's (`develop`'s `z.svelte.ts` reports them), so `isOnline()` has one writer; `db.svelte.ts` does not report, and the branch's `reportSyncStatus` and `connectionOf` in `state/online.svelte.ts` stay behind until the cutover makes PowerSync the reporter. The status bar's resume ("Catching up") is separate state and follows PowerSync's resume on the twin. Zero's "off" paths (`zero/resource.svelte.ts`, `z.svelte.ts`) go: Zero runs normally, without the guidebook preload. Likewise `state/sync.svelte.ts` has one writer of sync and store state per build: with the preload off, `z.svelte.ts` also skips `trackSyncFor` and its store probe (`markStoreLoaded`), so in the PowerSync build only `db.svelte.ts` reports them (Zero's lost-store reload still calls `forgetSynced`, as on the branch); otherwise a Zero replica answering the probe first would read offline as a cold store. Task 8.3 drives this build.
- `components/StatusBar/statusBar.ts` keeps one implementation with the branch's `resume` argument; `ResumeState` moves out of `$lib/powersync` into `statusBar.ts`, so the Zero build names no PowerSync module.
- Twinned whole, since the branch rewrote their logic: `map/exploreData.svelte.ts` (`develop`'s reads the map summary through `map/summary.ts` and gates on `isFieldDevice`; the branch's holds reads behind the sheet and reads raw SQL), `components/EntitySearch/search.svelte.ts` (`develop`'s debounces and reports `searchReady` for `opensEmpty`; the branch's holds the shown groups a frame, since local reads answer a frame apart; the PowerSync side accepts `opensEmpty` and ignores it), `entities/favorite/save.svelte.ts` (PowerSync's read sees a write only once it syncs back, so the branch's shows the wanted state until then; `develop`'s relies on Zero applying the mutator locally at once).
- The modules above the entity functions stay one file when they read only through entity functions (user, 2026-11-16: no copy for a module without engine code):
  - `entities/route/similarMatches.svelte.ts` stays `develop`'s; the PowerSync `routesByIds` accepts `ttl` and ignores it.
  - `components/EntitySearch/recent.svelte.ts` and `components/Markdown/lib/references.svelte.ts` take the branch's version, which reads through `areaList`, `blockList`, `routeList`, `routesByIds`, `userList` and `usersByIds` instead of `develop`'s direct `queries.*` reads. On Zero these run the same queries `develop`'s file ran (`listAreas`, `listBlocks`, `listRoutes`, `listUsers`, `usersByIds`), each written beside its `develop` call in the task.
  - They map DTOs to search items through a new `EntitySearch/entityItems.ts`, which holds only the branch's DTO-based item mappers under their own name, `entityItemMappers`. `develop`'s `search.svelte.ts` keeps its row-based `entityMappers` and every export, so it and its tests stay untouched; the PowerSync search twin maps through `entityItemMappers` and re-exports `develop`'s `entityMappers` and other exports, so `twins.ts` holds.
- `zero/resource.svelte.ts` is not twinned: it serves Zero reads in both builds. It gains one export, `holdWhileArriving`, which `$lib/powersync/resource.svelte.ts` imports. The branch's tests of `psResource`, which sit in its `zero/resource.svelte.test.ts`, move to `src/lib/powersync/resource.svelte.test.ts`.
- `zero/z.svelte.ts` stays `develop`'s, plus one input that skips the guidebook preload stages (default: preload, as today).
- `pickerMapProps` moves out of the branch's `exploreData` into its own neutral file, `map/pickerMapProps.ts`, which the three pickers call with either build's map data; `countsUnknown` is optional there, `false` when the Zero `exploreData` has none, so the PowerSync pickers keep the branch's "no false zeros" fix.

Copying large files that differ little would trip `lint:duplication`, whose baseline only shrinks; hence the one input on `z.svelte.ts` and the shared `pickerMapProps` file.

### D5. What lands as engine-neutral

From the branch as they are: `map/layers.svelte.ts`, `Map.svelte` and `map/types.ts` (`countsUnknown`, default off), `entities/grade/donut.ts` (a null total, never passed by Zero), `entities/block/order.ts` exports, `i18n/collator.ts` and its test, `db/testDb.ts` `seedTwoRegions` (with the Zero tenancy test keeping its guidebook case), `e2e/support.ts` `settle()` and the `example.invalid` abort, `e2e/invite.spec.ts`, `deployment/secrets.mjs`, `state/sync.svelte.ts`'s store-warm addition (inert for Zero), the PowerSync parts of `CONTEXT.md` reworded to the seam. The five branch changes outside the engines (four Zero-visible fixes and a dead-code removal) land as the seam branch's first commits, one each (proposal).

### D6. Build switch and the Zero build's guard

`vite.config.ts` reads `PUBLIC_SYNC_ENGINE` through `loadEnv` (where `$env/static/public` does not exist yet), fails on an unknown value, and only for `powersync` adds the twin plugin, `powerSyncJspi()`, the `worker` block, the `optimizeDeps` exclusions and the wa-sqlite wasm globs and size cap in `injectManifest`. For `zero` it adds a guard plugin that fails the build when anything resolves `@powersync/*`, `@tanstack/*db*`, `$lib/powersync/*` or a `*.powersync.*` file, in the app build. The service worker builds apart (`src/sw.ts` with `configFile: false`, and Workbox takes no plugins), so a test walks its imports through the same guard. Both plugins act in `vite build` and `vite dev` (e2e and drives run on the dev server) and are inactive under vitest (`process.env.VITEST`): the vitest projects use `extends: true` and inherit `vite.config.ts`'s plugins, so a guard active under vitest would refuse every PowerSync unit test, and the twin plugin would hand twin tests the Zero file. Tests import what they test by its explicit path (D1). CI already runs `npm run build` before the tests, so the guard needs no new CI step. `src/sw.size.test.ts` asserts the wasm in the precache whenever the build emitted it. A Zero build cannot precache it: the guard stops every PowerSync module, and the Zero `globPatterns` exclude `.wasm`.

Alternative: grep the built output for `powersync`. Rejected: the health page's copy and minified chunks make a text match unreliable; the resolver sees module ids.

### D7. The sync health page in both builds

`routes/(app)/settings/sync/+page.svelte` keeps the health card only. Production keeps `develop`'s settings (`deployment/SECRETS.md`: `PUBLIC_POWERSYNC_URL` on Vercel, `SYNC_HEALTH_URL` a local override only), and `syncHealth.remote.ts` reads the URL on the server; `syncHealth.remote.ts` and its test land as they are (app-admin gated, `NO_GATE` entry in `remote/gates.test.ts`); the settings link stays inside the existing admin-only block. It talks to the PowerSync service from the server, so a Zero client still makes no PowerSync request.

### D8. Tests and lint

- The test seams (E1 to E4, and S4 to S8 carried over) are listed once, at the top of tasks.md.
- PowerSync unit tests with `@powersync/web` faked run in CI on every PR. `streams.server.test.ts` and `schema.server.test.ts` need only Postgres, so they run in CI too (the stream predicates' region boundary on every PR); `streams.local.server.test.ts` needs the service and skips without it.
- `.fallowrc.jsonc` lists `src/**/*.powersync.*` as entry points (screens never import a twin by name) and as one duplication-ignore glob, since R3 deletes the Zero side of each pair.
- `.fallow-health-baseline.json` is not carried over; `npm run lint:baseline` shrinks it after the move.
- `e2e/support.ts` probes the PowerSync service (:58100) only when `PUBLIC_SYNC_ENGINE=powersync`.
- AGENTS.md hand-back gains the both-builds rule: a change to a read or a write is checked on both builds before merging; e2e and drives run on the Zero build.

### D9. Branch and commits

`feature/engine-seam` starts from `develop`; the five fixes outside the engines are its first commits, one each, so each still reverts alone (user, 2026-11-17: no wait for separate PRs). Files come from `feature/powersync` by path (`git checkout feature/powersync -- <path>`), never by merge. After the five fix commits, the change lands as about three commits, each type-checking on its own: the PowerSync client with the build switch, the guard and what its runtime and tests import from shared code (`state/sync.svelte.ts`'s store-warm addition, `holdWhileArriving`, `db/testDb.ts`'s `seedTwoRegions`, `state/indexedDbStub.test-helper.ts`); tests that import twin exports (S6, S7) land with the twins; the twins, the Zero wrappers and the neutral parts; the two OpenSpec folders and the docs. Before apply starts, a review loop runs over `feature/powersync`'s own commits since `1308a703` (the last commit a review loop covered, the rebased copy of the milestone's stale `20e87d76`), with its fixes made there, so this change's review only has to read the seam.

### D10. Removed before building (subtract pass, user 2026-11-16)

- No measurement aids come over, not even the sync timeline: its one planned use, the iPhone first sync before the cutover (milestone D17), brings it back from the `archive/powersync-milestone` tag if still needed. The spec's "No build carries measurement tools" holds this.
- No hand-written engine interface: the Zero module's exports are the contract (D2).
- One new bundle check, the Zero build's guard plugin (D6). The Zero precache needs no check of its own (D6); `sw.size.test.ts` keeps the branch's PowerSync assertions; no new CI step, no output grep.
- `CONTEXT.md` gains only "engine switch" and "engine seam", the terms the code uses. "Cutover" and "native checkpoint" stay defined once, in the milestone's roadmap.md and design.md.
- No neutral re-export files and no renamed Zero files (D1); no `zero/retired.ts` (proposal Non-goals).

## Risks / Trade-offs

- [A Zero wrapper does not run the exact `develop` query] → Each wrapper's task compares it with the `develop` call site it replaces; the Zero e2e suite and the Zero drive at both viewports run before the merge.
- [A twin falls behind its Zero sibling] → `twins.ts` fails svelte-check on a missing or reshaped export; `twins.test.ts` fails on an unlisted twin.
- [The twin plugin redirects an import it must not, or misses a twin] → E1 tests relative and aliased specifiers and the PowerSync-code exemption. The PowerSync build still runs Zero, so a missed redirect renders the same rows; 8.3's network log showing PowerSync reads, not the screens alone, is the check.
- [Both twins of a module grow apart in behavior a screen relies on] → The both-builds rule in AGENTS.md; the spec's same-screen scenario is driven on both builds before the merge.
- [Two engines on one client in the PowerSync build (Zero for writes)] → Local only; no deployment builds `powersync` until R1.
- [Duplication between twins] → Accepted where the branch rewrote a module, under one duplication-ignore glob for `*.powersync.*` (D8), never a baseline entry.

## Migration Plan

1. Create `feature/engine-seam` from `develop`; the five fixes become its first commits.
2. Review loop over `feature/powersync` since `1308a703`; fixes there.
3. Build `feature/engine-seam`, review loop over its diff against `develop`, merge.
4. Deploy: production builds `zero` (the setting is unset), so nothing changes for users. Rollback: revert the merge.
5. Tag `feature/powersync` as `archive/powersync-milestone`, push the tag, delete the branch.
