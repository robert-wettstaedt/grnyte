# Proposal

## Why

The explore map syncs every live route row of a region, unfiltered and on every device, only to count routes per
block, draw each pin's grade donut and match search text. On prod that query (`listRoutesForMap({})`) is one of the
four unbounded queries behind most synced rows, and region 32 is about to grow from about 5,000 to about 8,000
routes with the guidebook rebuild. The pins need a per-block summary, not the routes.

## What Changes

- Blocks carry a summary of their live routes: a count per community grade, with a bucket for routes without one.
  A database trigger keeps it current on every route insert, delete, soft delete, restore, regrade, block move and
  region move, whoever writes. A recount function serves bulk scripts and the backfill.
- With no filter and no search active, the map draws its pins, counts and donuts from the summaries and syncs no
  route rows. This holds for every region.
- A grade-range filter is answered from the summaries too. The block and area detail screens judge "matches the
  filter" against their own route rows for a grade range, not against ids the map published.
- Every other filter (tags, text, first ascensionist, rating, beta, topo, favorites, done, project) pulls the
  matching routes as today.
- Map search matches names and descriptions of areas, blocks and routes, as the search dropdown does. Routes come
  from a debounced Zero query through the map's filter that stops syncing as soon as the term changes (`ttl: 'none'`);
  a field device answers it from its own rows. The "not sent yet" filter is answered from the summaries minus the reader's own sends.
- The "your region is live" card checks for its first route through the general route list instead of the map's route query.
- `listRoutesForMap` is no longer asked unfiltered; it remains the map's query for the filters the summaries cannot
  answer.

## Capabilities

### New Capabilities

- `map/block-summary`: what a block's route summary holds, when it is current, and that the map's unfiltered pins
  come from it.

### Modified Capabilities

- `map/marker-search`: search matches names and descriptions; routes need not be on the device online.
- `map/route-filter`: a grade-range filter is answered from the summaries, and detail screens judge matches from
  their own rows.

## Non-goals

- Offline by chosen areas, or any change to what a field device keeps (`src/lib/zero/offline.ts` `KEPT`). Decided
  after measuring cold-start cost on a production build with data the size of region 32 (about 8,000 routes,
  1,660 blocks, 1,150 areas).
- Changing the donut's look or the grade colour scale.
- A server-side answer for the other filters.

## Impact

- **Schema**: `blocks.grade_counts` (jsonb), a trigger and a recount function on `routes`, a backfill migration;
  `zero-schema.gen.ts` regenerated.
- **Entity modules and screens**: `src/lib/entities/block` (mapper, map list), `src/lib/entities/route`
  (`resources.svelte.ts`), `src/lib/zero` (`resource.svelte.ts`, `ttlSource.svelte.ts`), `EntitySearch/search.svelte.ts`, `src/lib/map/exploreData.svelte.ts`,
  `narrow.ts`, `filteredRoutes.svelte.ts`, `src/lib/state/searchQuery.svelte.ts`, the explore layout and
  `Filter/Filter.svelte`, `routes/[id]/RegionLive.svelte`, the block and area detail pages.
- **Scripts**: `split-region.ts` (triggers off), `move-area.ts`, `guidebook-import.ts`, `seed-volume.ts` call the
  recount.
- **Client-breaking across the deploy**: no URL, remote export or `manifest.id` changes. `listRoutesForMap` stays
  deployed, so a tab loaded before the deploy keeps working. A pre-deploy tab ignores `grade_counts`.
