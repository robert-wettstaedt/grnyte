# Proposal

## Why

The explore search follows the reader onto detail screens, but the route filter (grade, rating,
tags, topo, beta, first ascensionists, ascent status, favorites) does not: detail URLs carry no
filter parameters, so the map under a sheet silently shows every route and comes back filtered when
the sheet closes. The two should behave the same. They cannot do so by carrying the filter alone,
because the filter narrows routes and so changes counts: a block's marker would say 2 while its
sheet lists 6. So carrying the filter needs the detail screens to tell the truth about it too.

Applies after `keep-open-entity-on-filtered-map`, which adds the open-entity exemption and the
search indicator this change extends.

## What Changes

- The route filter set on the explore or search screen keeps narrowing the map while a detail
  screen is open, the same way the search text does. A fresh deep link to a detail opens unfiltered.
- A block's detail, with a filter active, still lists every route, says how many match
  ("2 of 6 routes match your filters"), and dims the rows that do not.
- An area's detail, with a filter active, shows "12 of 80 routes", "2 of 6" on each block row, and a
  grade chart with matching routes drawn over the faded full profile.
- The area route list's own filter sheet edits that same filter, so the map, the indicator and the
  explore screen agree with it.
- The detail indicator also names an active filter ("Filters on", "Rubber Gun + filters"), and its
  clear control clears the filter together with the search.

## Non-goals

- Topo images keep drawing every line, and sibling navigation keeps every block in slot order.
- No filter parameters in detail URLs, and no filter editing from detail screens other than the
  area route list.
- The indicator's label stays inert.

## Capabilities

### New Capabilities

- `map/route-filter`: how the route filter carries from the explore screens onto detail screens,
  how those screens report what matches it, and how it is cleared from a detail.

### Modified Capabilities

None. The indicator requirements live in `map/marker-search`, introduced by
`keep-open-entity-on-filtered-map` and not yet in the main specs; this change adds its filter half
as requirements of `map/route-filter` instead of modifying an unarchived spec.

## Impact

- Routes: `(map)/+layout.svelte` (filter source, indicator), `(map)/blocks/[id]/+page.svelte`,
  `(map)/areas/[id]/+page.svelte`, `(map)/areas/[id]/BlocksList.svelte`,
  `(map)/areas/[id]/routes/+page.svelte`, `(map)/Filter/Filter.svelte`.
- State: `src/lib/state/searchQuery.svelte.ts` grows into the shared map narrowing (search text plus
  filter), or a sibling module beside it.
- Components: `GradeHistogram` (a faded total behind the matching bars), `RouteList` / `RouteRow`
  (a dimmed row).
- Entity modules: none new. Matching reuses the map's already filtered `listRoutesForMap` rows; no
  new Zero query, no tables, no schema change.
- i18n: new keys in `messages/en.json` and `messages/de.json` for the match counts and the
  indicator's filter labels.
- Client-breaking: none. No URL, remote function export or `manifest.id` changes; `/explore`
  filter URLs keep working, including shared ones.
