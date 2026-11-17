# Proposal

## Why

PowerSync got its go on 2026-11-16 (`migrate-sync-to-powersync-milestone`, facts.md). Its code lives on `feature/powersync`, which replaced the Zero reads in place and cannot merge while production runs Zero. The PWA switches only after R1 (design D17 of that change), and the monorepo split starts on top of this merge, so the PowerSync code must reach `develop` now without changing what production runs.

## What Changes

- A build-time engine switch, `PUBLIC_SYNC_ENGINE=zero|powersync`. Unset means `zero`; any other value fails the build. Production and every deployment build `zero`.
- An engine seam: a module that differs per engine has a PowerSync twin beside it (`resources.svelte.ts` and `resources.powersync.svelte.ts`). The PowerSync build swaps a module for its twin wherever non-PowerSync code imports it; PowerSync code imports twins by name. The Zero build never sees a twin. The Zero module's exports are the contract the twin must match.
- The Zero side is `develop`'s code. It changes only by small wrapper exports for function names that the branch's screens call (`anyArea`, `areaRouteList`, `routeDetailList`, the `enabled` option), filter types widened to a sort their queries already take, one export of `zero/resource.svelte.ts`, calls into the twinned `state/engine.ts`, and one `zero/z.svelte.ts` input that the PowerSync build uses to skip the guidebook preload and Zero's sync-state reports; the Zero build runs the same queries as today.
- The PowerSync side comes from `feature/powersync` by path, through a new branch `feature/engine-seam` off `develop`, in about three commits. The branch history does not merge.
- The Zero build contains no PowerSync code: no `@powersync` module in its chunks, no PowerSync wasm in its precache, no JSPI plugin. The Zero build fails when anything loads PowerSync code, so CI needs no new step.
- In the PowerSync build, reads come from PowerSync; writes, feed, inbox, comments and reactions stay on Zero until R1. That build runs locally only, never deployed.
- The sync health page (`settings/sync`, app admins) lands in both builds, without its measurement cards.
- Left behind on `feature/powersync`: every measurement aid (`PUBLIC_SYNC_ONLY_POWERSYNC`, `PUBLIC_POWERSYNC_VFS`, `PUBLIC_POWERSYNC_MULTITABS`, the page-load counter, the sync timeline, `scripts/measure*.ts`) and `zero/retired.ts`.
- Five branch changes outside the engines land as this change's first commits, one each, ahead of the seam: dead code removed from the notification click in `src/sw.ts`, and four fixes that change Zero behavior: the late Toaster mount, the 1 s no-regions hold in `(app)/+layout.svelte`, the sheet close in `(map)/+layout.svelte`, the one-line grade header on `areas/[id]`.
- AGENTS.md gets the both-builds rule; CONTEXT.md gets "engine switch" and "engine seam".

## Capabilities

### New Capabilities

- `sync/engine-switch`: which sync engine a build runs, how it is chosen, and what a build of one engine must not contain.

### Modified Capabilities

None. Production keeps every requirement of `openspec/specs/sync/*` as it stands. The PowerSync requirements stay in the unarchived `migrate-sync-to-powersync-milestone` change until the cutover.

## Non-goals

- No PowerSync write path, no `/api/sync/mutate`, no `writes.ts` split: R1. `writes.ts` already is the write seam, with its one Zero implementation.
- No deployed PowerSync preview and no production credentials on previews: R1 or the cutover.
- No PowerSync service in CI, no PowerSync e2e in CI: R1.
- No monorepo split, no Expo work.
- No change for production users. The Zero build behaves as `develop` does today.
- No retired-query copies for old Zero tabs: the cutover plans that.

## Impact

- Entity modules, each getting a PowerSync twin: `area`, `ascent`, `block`, `favorite`, `file`, `firstAscensionist`, `geolocation`, `grade`, `region`, `rolePermission`, `route`, `topo`, `user` (`resources.svelte.ts`); `favorite/save.svelte.ts`.
- Shared modules getting a twin (the engine-specific part only): `map/exploreData.svelte.ts`, `components/EntitySearch/search.svelte.ts`. One file for both builds: `route/similarMatches.svelte.ts` (`develop`'s), `components/EntitySearch/recent.svelte.ts` and `components/Markdown/lib/references.svelte.ts` (the branch's, through entity functions, the same Zero queries), with the new shared `EntitySearch/entityItems.ts`. One app-level seam, the twinned `state/engine.ts` (start-up from `routes/(app)/+layout.ts`, the sign-out clear, whether the PowerSync service refused the download, the status bar's inputs), called from `state/wipe.ts`, `state/global.svelte.ts` and `components/StatusBar`. The guidebook preload in `zero/z.svelte.ts` gets one input.
- Screens taking the branch's code (the Zero side gets wrapper exports): `(map)/explore/+page.svelte`, `(map)/areas/[id]/AreaListItem.svelte`, `(map)/CreateOnMap/CreateOnMap.svelte`, `GuidebookPicker/MergeSheet.svelte`. Engine-neutral branch changes land as they are (`map/layers.svelte.ts` and `Map.svelte` with `countsUnknown` default off, `pickerMapProps`, `i18n/collator.ts`, `db/testDb.ts`, `e2e/support.ts`'s `settle`).
- New: `src/lib/powersync/` (client, schema, streams, SQL; server-side stream tests: two need only Postgres and run in CI, one needs the service and skips without it), `scripts/generate-powersync-schema.ts`, `scripts/powersync/client.ts` (test infrastructure), `routes/(app)/settings/sync/` (health page and `syncHealth.remote.ts`, a new remote export).
- Build: `vite.config.ts` (the switch, the twin resolution, and the JSPI plugin, worker block, `optimizeDeps` exclusions and wasm precache gated on `powersync`), `package.json` (PowerSync and TanStack DB dependencies, `generate:powersync`), `.env.example`, `.fallowrc.jsonc` (twins as entry points).
- i18n: the sync health keys and `status_catchingUp` in both locales; the measurement keys never land.
- Tables: none. No schema change, no migration.
- Client-breaking: none. No URL, no existing remote export and no `manifest.id` changes; `syncHealth.remote.ts` is a new export, so open tabs never called it. Already-loaded tabs keep running the Zero build across the deploy, since the deployed build stays Zero.
