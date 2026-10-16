# Proposal

## Why

A reader who finds a route through the explore search, opens it, and follows its breadcrumb to the
block lands on a map where that block is missing and the Show button is gone. The live search text
keeps narrowing the map markers on detail screens (deliberately), it matches only block and area
names, and the open block is filtered out with everything else. The search bar is hidden on detail
screens, so the reader has no way to tell why. This breaks the existing camera-ownership promise that
the reader can always recover the open entity's framing.

## What Changes

- The open block, or every block under an open area, is always drawn on the map and can always be
  framed, whatever the live search text excludes. The exemption ends when the detail closes.
- The map search also matches blocks by the names of their routes, so searching a route name shows
  its block instead of an empty map.
- On a detail screen with an active search, the map shows a quiet chip naming the search text, with
  a separate clear control. Clearing it ends the search and the map shows every block again.
- The route detail action bar gains a Show action that opens the route's block on the map. It is
  offered only when the block has a location.

Today the route filter (grade, tags, favorites, and the rest) is read from the current URL, and
detail URLs carry none, so on detail screens only the search text narrows the map. That is a gap,
closed by the follow-up change `carry-route-filter-into-details`. This change keeps the chip about
the search text and states the exemption against whatever narrows the markers, so the follow-up only
adds to both.

## Non-goals

- Carrying the route filter onto detail screens, and making those screens filter-aware. That is
  `carry-route-filter-into-details`, applied after this change.
- No new marker style for an exempted block. The existing selected-block highlight is enough.
- The chip's label is not interactive. It does not navigate back to the search results.
- The route detail Show action does not highlight the route in the block's route list.
- No chip on `/explore` or `/search`, where the search bar is visible.

## Capabilities

### New Capabilities

- `map/marker-search`: how the live search text narrows the explore map markers, which entity is
  exempt from it, and how a reader on a detail screen sees and clears it.

### Modified Capabilities

- `map/camera-ownership`: adds that a route's detail, which lives outside the map, offers to show its
  block on the map.

## Impact

- Entity modules: `src/lib/entities/route/resources.svelte.ts` (`routeMapList` keeps the route name).
- Map data: `src/lib/map/exploreData.svelte.ts` (search scope, exemption), `src/lib/map/filteredRoutes.svelte.ts`
  if its row type needs the name.
- Routes: `src/routes/(app)/(shell)/(explore)/(map)/+layout.svelte` (open entity, chip offer),
  `src/routes/(app)/routes/[id]/RouteActions.svelte` (Show action).
- Components and state: `src/lib/components/StatusPill/StatusPill.svelte` and
  `src/lib/state/pill.svelte.ts` (a new dismissible face, ranked like an action),
  `src/lib/state/searchQuery.svelte.ts` (clearing from outside the bar).
- Tables: none. No schema change, no new Zero query (route names are already in the rows
  `listRoutesForMap` syncs).
- i18n: new keys in `messages/en.json` and `messages/de.json` for the chip's clear control.
- Client-breaking: none. No URL, remote function export or `manifest.id` changes. An already-loaded
  tab keeps the old behaviour until it reloads.
