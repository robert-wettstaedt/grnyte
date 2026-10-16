# Design

## Context

`createExploreMapData` (`src/lib/map/exploreData.svelte.ts`) derives one `blocks` array from the
live search text (`liveSearchQuery`, kept across a detail round trip on purpose) and the route
filter. The explore layout (`(map)/+layout.svelte`) hands that same array to the marker layer and to
`cameraTarget`, so a block the search excludes is neither drawn nor framed, `focus` is null, and
`sheetState.canShowOnMap` hides `ShowOnMapButton`.

The route filter is parsed from `page.url.searchParams`, and detail URLs (`entityHref`, pushed by
`Map.svelte` and breadcrumbs) carry none, so on a detail screen only the search text narrows. Search
matches block and area names only: `routeMapList` maps rows down to `{ blockFk, gradeFk, id }` and
drops the name, although `listRoutesForMap` syncs whole route rows.

All reads here are existing Zero queries (`listRoutesForMap`, `blockMapList`, `areaMapList`,
`blockDetail`). There are no writes, no remote functions, and no schema change.

## Goals / Non-Goals

**Goals:**
- One place decides which blocks the map draws, and it is a pure function with a unit test.
- The exemption feeds both the markers and the camera from the same array, so they cannot disagree.

**Non-Goals:**
- Changing what the route filter does on detail screens (`carry-route-filter-into-details`).
- Touching `cameraTarget`: given the right `blocks`, it already frames and claims correctly.

## Decisions

### 1. Narrowing moves into a pure `narrowBlocks` in `src/lib/map/narrow.ts`

The `searchBlockIds` and `blocks` deriveds in `exploreData.svelte.ts` become a call to
`narrowBlocks({ blocks, routes, search, filterActive, routeCountByBlock, open })`, where `open` is
`{ kind: 'blocks' | 'areas', id } | null`. Order: search scope (block name, any area name, any of its
routes' names), then the route filter, then add back the open block or every block whose `areas`
chain contains the open area. The untouched path (no search, no filter) still returns the source
array by reference, which the map layers rely on to avoid a flash.

Alternative: pin inside the layout by concatenating the open block onto `explore.blocks`. Rejected:
the area case needs the unfiltered block list, which the layout does not hold, and two places would
then decide what is drawn.

`createExploreMapData` takes a fourth getter, `open`, which the layout derives from `entityOf`
(`cameraTarget.ts`) and `page.params.id`. Parking is never narrowed, so `open` is null for it.

### 2. Route names come from the existing map rows

`routeMapList`'s mapper keeps `name`. `narrowBlocks` matches routes from `routes.data`, which is
already the filtered list, so search and filter compose without extra work. No new query, no extra
synced rows.

### 3. The indicator is a new `dismiss` face on the existing pill

`PillOffer` (`src/lib/state/pill.svelte.ts`) gains
`{ kind: 'dismiss'; icon; label; announcement; dismissLabel; ondismiss }`. `PillSurface` picks an
action, then a status (so "Loading map" is heard before the search), then `dismiss`, then syncing.
`PillHost` treats `dismiss` as pressable: shown at once, inert while it lingers, and announced through
`announcement` because the visible label is only the query. `StatusPill.svelte` renders it on the
status face's quiet surface: a leading icon and inert label, then a 32px icon button, the pill's full
height. The layout offers it on its own pill surface only while a detail is open, not on `/search`,
with non-empty search text. With a sheet open the pill hangs at the top (at 375px the bar's slot
overlaps the sibling navigation above the sheet; placement keeps it under, since its hint owns the
top), its label capped to the uncovered strip by container units so the button stays on screen, and with a desktop sheet open it centres on
the map right of the sheet, which otherwise covers it below about 1030px.

Alternatives: the existing filled `action` face with the whole pill as the button (reads as "go back
to results"), or showing the search bar on detail screens (spends the map space the hide exists to
save). Both rejected while grilling.

### 4. Clearing calls `setLiveSearchQuery('')`

`src/lib/state/searchQuery.svelte.ts` already exposes the setter. The bar is unmounted on detail
screens and re-reads the shared value on mount, and `exploreReturn` already strips `q`, so closing
the detail lands on an empty bar.

### 5. Route Show reuses `ShowOnMapButton`, promoted to `$lib`

`$lib/components/ShowOnMapButton` renders the shared tool (icon, caption, accessible name, slide) as a
link when given an `href` and as a button otherwise, gated by a `shown` prop. The `(map)` copy becomes
a wrapper binding it to the explore sheet's state. `RouteActions` passes `entityHref('blocks', id)` (an
href passed as a prop, so the helper per AGENTS.md) and `shown` when the block has a pin.

## Risks / Trade-offs

- [Route-name matching scans every route per keystroke, about 21k on the prod-shaped region] →
  plain loops over plain arrays, no reactive collections (see the explore map performance note);
  measure on region 18 while driving.
- [Back from the explore screen to `/search?q=...` restores the search the reader cleared] →
  accepted: that is the history entry they made; the spec only promises the cleared search survives
  closing the detail.
- [A pill offered by the map layout competes with its `map_loading` status] → the status wins, so
  the clear control waits for loading to end; loading only matters on cold load.
- [Placement hides the search bar, and its hint pill takes the top centre the chip would use] →
  placement suspends the search narrowing instead (the layout passes '' while `placing` is set), so
  there is nothing hidden to report and no blocks hidden next to the new one.
