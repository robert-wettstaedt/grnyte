# Design

## Context

Builds on `keep-open-entity-on-filtered-map` (`narrowBlocks`, the open-entity exemption, the
`dismiss` pill face and the search indicator).

`(map)/+layout.svelte` parses the filter from `page.url.searchParams` on every route
(`cachedFilters`), and separately captures `exploreReturn` from the URL on the explore and search
routes. Detail URLs carry no filter, so the parse comes back empty there. The area route list
(`areas/[id]/routes`) parses the same keys from its own URL and its `Filter` sheet writes them there.
The search text already lives in shared module state (`src/lib/state/searchQuery.svelte.ts`).

All reads stay existing Zero queries: the map's `listRoutesForMap` through `filteredRouteList`
(which also applies ascent status and favorites client-side), `routeList` and `blockRouteList` on
the detail screens. No writes, no remote functions, no schema change.

## Goals / Non-Goals

**Goals:**
- One source for "what narrows the map" across every screen under the explore layout.
- "Does this route match" is answered once, from rows the map already holds.

**Non-Goals:**
- Filter state in detail URLs, or a second filter for the area route list.

## Decisions

### 1. The filter joins the search in shared state, the URL stays its writer

`searchQuery.svelte.ts` gains the filter beside the text: the parsed filter and its query string
(only `FILTER_PARAM_KEYS`, never `q` or `sort`). The layout writes it from the URL on the routes
whose URL carries the filter (explore, search, the area route list) and leaves it alone everywhere
else; `filters` and `exploreReturn` both read it. That replaces `cachedFilters` and the separate
`exploreReturn` capture with one value, so the same-reference rule that keeps the map still is
applied once, at the write.

Alternative: query parameters on every detail URL. Rejected while grilling (touches `entityHref`,
`Map.svelte`'s `push`, breadcrumbs, sibling nav, and leaks filters into shared links).

### 2. The area route list is entered with the filter in its URL

Because that route writes the shared filter from its URL, arriving there with an empty query would
wipe the carried filter. The area detail's link to it (`areas/[id]/+page.svelte`) appends the shared
filter's query string. Its `Filter` sheet keeps writing the URL as today, which now flows into the
shared filter.

### 3. Matching comes from the map's filtered rows

The layout already holds the region's filtered route rows (`explore.routes`). It publishes, through
the same shared module, the set of matching route ids (null with no filter) and that resource's
phase. Detail screens intersect their own route ids with it. Counts go through `summaryOf`, so a
"2 of 6" shows from the rows on hand while the filtered set arrives and holds back only a zero.

Alternative: each detail screen runs `filteredRouteList` over its own query. Rejected: a second
filtered subscription per screen, and two answers to one question.

### 4. Presentation reuses the existing components

- Block detail: the routes heading switches to a match count key; `RouteList` takes an optional
  `dimmed(id)` and passes it to `RouteRow`, which lowers the row's emphasis. The heading text is what
  a screen reader gets; the dimming is visual only.
- Area detail: the route count and each `BlocksList` row use the same "n of N" key.
  `GradeHistogram` takes an optional `matchingByGrade`, drawn solid over the existing bars faded,
  with each bar's accessible label giving both numbers.

### 5. Clearing from the indicator

The indicator label composes from the search text and whether a filter is set. Clear empties both
in shared state; on the area route list, whose URL is the filter's writer, it also replaces the URL
without the filter keys, or the layout would write them straight back.

## Risks / Trade-offs

- [An entry into the area route list other than the area detail link arrives without the filter and
  clears it] → that link is the only in-app entry; a fresh deep link is meant to be unfiltered.
  Grep for other links to the route while applying.
- [A route matches on the map but the detail is still loading its own routes] → counts use
  `summaryOf` on both sides, so they settle rather than flash a wrong total.
- [Dimmed rows fall below contrast] → dim the row's secondary content, not its name, and check both
  themes at both sizes.
