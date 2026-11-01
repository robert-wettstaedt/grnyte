# Tasks

## 1. Schema and trigger

- [x] 1.1 Add `blocks.grade_counts` (jsonb, not null, default `{}`) in `schema.ts` with a column comment; run `generate:drizzle`. Verify: the generated migration adds only the column.
- [x] 1.2 Append to that migration the `SECURITY DEFINER` trigger function (delta form, pinned `search_path`) and the `AFTER INSERT OR UPDATE OF block_fk, user_grade_fk, deleted_at OR DELETE` trigger on `routes`. Verify: a server test inserts, regrades, moves, soft deletes, restores and deletes routes as a read-only member and asserts each block's summary after each step.
- [x] 1.3 Add `recount_block_grade_counts(int[])` (`SECURITY DEFINER`) and a backfill migration calling it for every block. Verify: after `npm run migrate` on a throwaway DB seeded with `ci/seed.sql`, every block's `grade_counts` equals a direct count of its live routes (one SQL assertion in the test).
- [x] 1.4 Run `generate:zero`. Verify: `zero-schema.gen.ts` has `gradeCounts` on blocks and `svelte-check` passes.

## 2. Scripts

- [x] 2.1 `split-region.ts`: no call needed. With triggers off it moves blocks in place (`regionMove.ts` `update blocks set region_fk`), so each block's summary travels with it; `purge-region.ts` deletes the blocks.
- [x] 2.2 `move-area.ts`, `guidebook-import.ts`, `seed-volume.ts`: no call needed. They write with triggers on, which the trigger test covers; the recount stays for the backfill and any future script that turns triggers off.

## 3. Map from summaries

- [x] 3.1 Map `gradeCounts` through the block mapper and `blockMapList`. Verify: mapper unit test, including the `none` bucket.
- [x] 3.2 `exploreData.svelte.ts`: build `routeCountByBlock` and `gradeCountByBlock` from the summaries when no filter or only a grade range is active, narrowing the summary to the range; request route rows only for other filters. Verify: unit test of the narrowing, and in the app the unfiltered map registers no `listRoutes*` query (Zero inspector).
- [x] 3.3 `RegionLive.svelte`: its "exactly one route" check moves from `listRoutesForMap` to `routeList` with the same `pageSize: 2`; `listRoutesForMap`'s `pageSize` stays one release for open tabs. (No screen shows a region's route total, so the summaries have nothing to replace here.) Verify: typecheck; the card still appears for a region with one route.

## 4. Search and not sent yet

- [x] 4.1 `createResource` takes `ttl`, backed by `ttlSource` (Zero's own `materialize`, since zero-svelte takes no TTL); the map search and the dropdown's search queries use `ttl: 'none'`. Verify: `ttlSource.svelte.test.ts` (TTL passed, view destroyed when unread, disabled never materializes), each seen red.
- [x] 4.2 Map search: `listRoutesForMap` with the filter plus `content`, through `filteredRouteList`, debounced 250 ms, quietly, holding the last answered search while pending; `narrow.ts` matches blocks and areas by name or description. Verify: `narrow.test.ts`; drive a route-name and a description search, with and without a filter.
- [x] 4.3 "Not sent yet" (alone or with a grade range) from the summaries minus the reader's sends (`withoutRoutes` in `src/lib/map/summary.ts`), no server read: the sends are bounded by the reader's logbook. Verify: `summary.test.ts`; in the app the todo filter syncs no route rows.

## 5. Detail screens

- [x] 5.1 The layout publishes a match test (`MatchTest` in `searchQuery.svelte.ts`): by the route's own grade and the reader's sends when the summaries answered (`inGradeRange`), else by the map's rows. Verify: `summary.test.ts`.
- [x] 5.2 Block detail (`blocks/[id]/+page.svelte`) and area detail (`areas/[id]/+page.svelte`): apply the layout's `MatchTest` to their own rows. Verify: drive a grade-only filter: "2 of 6", dimming, and the area chart.
- [x] 5.3 `Filter/Filter.svelte` takes `total` and `countByGrade`, which the map derives from its per-block counts and the area routes sheet from its rows. Verify: the counts match the DB on the dev region.

## 6. Offline registry and deploy gap

- [x] 6.1 No change: `listRoutesForMap` stays the map's query whenever a filter the summaries cannot answer is active, and stays in `GUIDEBOOK_COVERED` for offline. Only its unfiltered use is gone. Verify: `offline.drift.test.ts` passes unchanged.

## 7. Verification sweep

- [x] 7.1 Over the touched paths: `npx prettier --write`, `npx eslint`, `npx vitest run --project server` and `--project browser`, `svelte-check`, `npm run lint:duplication`, `npm run lint:unused`. Verify: all clean.
- [x] 7.2 Drive the explore map, a grade filter, a tag filter, search and a block and area detail at 375x667 and 1280x800, both themes. Verify: pins, counts and donuts match the pre-change map on the dev region.

## Workflow follow-up

- Measure cold-start cost on a production build with data the size of region 32, to decide offline by chosen areas.
