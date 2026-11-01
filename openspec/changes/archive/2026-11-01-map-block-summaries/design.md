# Design

## Context

See proposal.md, Why. Today `createExploreMapData` (`src/lib/map/exploreData.svelte.ts`) builds
`routeCountByBlock` and `gradeCountByBlock` from `routeMapList` (`listRoutesForMap`, slim rows with `blockFk`,
`userGradeFk`, `name`), and `narrow.ts` matches search text against those rows' names. `filteredRouteList`
(`filteredRoutes.svelte.ts`) applies done, todo, project and favorites on the device because Zero cannot express
`not(exists())`. `searchQuery.svelte.ts` publishes the matching route ids (`setMatchingRoutes`), which the block and
area detail pages read for "n of N", dimming and the area grade chart. `RegionLive.svelte` asks for two route rows
to show a count.

`recalcUserGradeAndRating` (`entities/route/user-grade.server.ts`) updates `routes.user_grade_fk` as the caller,
under RLS, so any member who logs an ascent writes `routes`. `split-region.ts` runs with
`session_replication_role = replica`, which turns triggers off.

## Goals / Non-Goals

Goals: no route row syncs for an unfiltered or grade-only map; the summary is correct under every writer.
Non-goals beyond the proposal: no change to `blocks` permissions, the donut component, or the offline `KEPT` table.

## Decisions

### 1. `blocks.grade_counts` jsonb, keys are grade ids plus `"none"`

One column on the existing `blocks` row, so Zero carries it to every client with the block and the map's existing
`blockMapList` reads it with no new query. The route total is the sum of its values. Alternatives: a
`block_summaries` table (one more synced table and join for no gain); 4 tier counts (would change the donut and
cannot answer a grade range).

### 2. A row trigger on `routes`, `SECURITY DEFINER`, delta form

`AFTER INSERT OR UPDATE OF block_fk, user_grade_fk, deleted_at OR DELETE` on `routes`, one function: subtract the
OLD row's contribution if it was live, add the NEW row's if it is live. This one rule covers insert, delete, soft
delete, restore, regrade and block move, and a region move needs nothing extra because the summary lives on the
block. Each side is a single `UPDATE blocks SET grade_counts = jsonb_set(...)` on that block, never read then
write, so concurrent writers do not lose counts. `SECURITY DEFINER` with a pinned `search_path`, following
migrations 0115 and 0117: the writer is often a member who may not update `blocks`, and under RLS the update would
match no row silently. Zero counts with value 0 are removed, so an empty block holds `{}`.

Rejected: maintaining the counts in the app's write paths (misses scripts, raw SQL and any future writer);
statement-level triggers with transition tables (the row form is simpler, and bulk scripts recount instead, see 3).

### 3. `recount_block_grade_counts(block_ids int[])` for the backfill

A set-based recount from live routes, also `SECURITY DEFINER`, used by the backfill migration. No script needs to
call it today: the two that turn triggers off move blocks in place (`split-region.ts` via `regionMove.ts`) or
delete them (`purge-region.ts`), so a block's summary stays true; every other script writes with triggers on.

### 4. Reads

- Summaries: Zero, on the block row (`blockMapList`, the block mapper's `toGradeSummary`).
- Search: one query per settled term, `listRoutesForMap` with the map's filter plus `content` (name or description,
  as the search dropdown's queries match), through `filteredRouteList` for the filters Zero cannot express. Built with
  `ttl: 'none'` (`createResource`'s `ttl`, through `ttlSource`, which materializes with Zero itself: zero-svelte takes
  no TTL), so a term stops syncing once the reader moves past it, and quietly, so it never holds the pill. A field
  device answers from its own rows, online or not; another device offline matches only blocks and areas. Blocks and
  areas match by name or description on the device. Debounced 250 ms; while the debounce or the query is pending the
  map narrows by the last answered search, text and matches together. The dropdown's four search queries take
  `ttl: 'none'` as well.
- Not sent yet: the summaries less the reader's sends (`withoutRoutes`). The sends come from the reader's ascents and
  `routesByIds`, both bounded by their logbook, so no server read and no SQL copy of the filter rules.
- Every other filter: `listRoutesForMap` with the filter, as before.

### 5. Detail screens get a match test, not ids

The layout publishes `MatchTest` (`searchQuery.svelte.ts`). When the summaries answered, it judges a route by its own
community grade (`inGradeRange`) and the reader's sends; otherwise by the ids of the map's filtered rows. The block
and area pages apply it to their own routes. The filter sheet (`Filter.svelte`) takes a total and a
per-grade count, which the map derives from its per-block counts in either mode.

### 6. `listRoutesForMap` stays

It is still the map's query for the filters the summaries cannot answer, and offline it answers from the device. On a
field device the map also registers it unfiltered, so reopening the app does not re-send the kept routes (see
Measured). On other devices the unfiltered request is gone. No query is removed, so there is no deploy gap.

## Risks / Trade-offs

- [Every regrade rewrites its block row, which replicates to all members] → It already rewrites the route row; one
  more small row per regrade is accepted.
- [A future script turns triggers off and changes routes' blocks] → It must call `recount_block_grade_counts`; the
  trigger test shows what that function restores.
- [Search results lag the keystrokes by the debounce and a round trip] → 250 ms; the map keeps the last answered
  search meanwhile, and a field device answers locally.
- [A filter other than grade still pulls many routes in a large region] → Accepted for now; filters are occasional
  and their rows are released with the filter.

## Migration Plan

1. Migration: column, function, trigger. 2. Migration: backfill via the recount. 3. `generate:zero`. 4. Deploy app
reading `grade_counts`. Rollback: the column is additive; the previous
app ignores it, and dropping the trigger stops the cost.

## Measured (2026-10-31)

Region 18 reseeded to region 32's post-import shape (7,940 routes, 1,676 blocks, 1,140 areas), `user@` (regions 2
and 18, 8,075 routes), production builds, perf zero-cache at 0.4 CPU, phone at 375 with 4x CPU throttle as a field
device. Medians of 5. Warm means the device kept its store but the server dropped the client group (>5 s away).
"Before" is `develop`, "no offline routes" is this change with `guidebookRoutes` left out of `KEPT` (not shipped).

| Desktop                           | Before        | After         |
| --------------------------------- | ------------- | ------------- |
| cold: map drawn / sync quiet      | 5.0 s / 4.8 s | 2.9 s / 2.8 s |
| cold: received / stored           | 4.2 / 3.8 MB  | 1.1 / 1.0 MB  |
| warm: map drawn / sync quiet      | 1.5 s / 3.4 s | 0.6 s / 1.3 s |
| rows held per client group        | 12,963        | 4,888         |

| Phone                             | Before        | After         | No offline routes |
| --------------------------------- | ------------- | ------------- | ----------------- |
| cold: map drawn / sync quiet      | 3.8 s / 4.4 s | 3.8 s / 6.0 s | 3.0 s / 4.1 s     |
| cold: received / stored           | 6.6 / 3.3 MB  | 6.6 / 3.0 MB  | 3.5 / 3.5 MB      |
| warm: map drawn / sync quiet      | 2.6 s / 6.4 s | 2.2 s / 6.3 s | 1.8 s / 5.4 s     |
| warm: received                    | 3.5 MB        | **7.0 MB**    | 3.5 MB            |
| rows held per client group        | 27,941        | 27,941        | 19,866            |

- Desktop gains about half its load time and three quarters of its download: `listRoutesForMap` was the bulk of
  the map's sync, not a cheap query.
- A phone gains nothing, since the offline guidebook keeps every route anyway.
- Regression, fixed: on a phone a warm resume downloaded 7.0 MB against 3.5 MB before. The kept routes were re-sent
  once no second query held them; holding them through `guidebookRoutes` itself did not help (same hash as the
  preload, still 24,208 rows flushed). A field device's map therefore keeps registering `listRoutesForMap`, which
  restores the resume to 3,501,583 bytes, byte for byte the before value. Why a second query prevents the resend is
  not understood. It costs nothing measurable: run back to back against `develop` in one session, a field
  device's first open drew the map in 5.2 s against 5.6 s and reopened in 4.6 s against 4.3 s. An apparent
  +1 s from separate sessions was drift between them (single runs spread 2.2 to 8.0 s on the same build).
- Not keeping the routes offline saves a phone ~3 MB and ~1 s of sync, but 3.5 MB (links, topo lines, blocks,
  areas) remains, and a warm resume re-downloads it all.
