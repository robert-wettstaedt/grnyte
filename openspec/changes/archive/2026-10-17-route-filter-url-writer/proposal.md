# Proposal

## Why

The route filter lives in the URL (`minGrade`, `maxGrade`, `minRating`, `ascentStatus`, `tags`,
`hasTopo`, `hasBeta`, `favorites`, `firstAscensionists`). `src/lib/map/filter.ts` has the reader
(`parseRouteFilter`) and the key list, but no writer. So `Filter.svelte` reads the same params a
second time by hand when the sheet opens (`toggleOpen`), and writes them back as nine hand-written
set/delete pairs when it applies (`applyFilter`). Adding a filter means touching the key list, the
parser, the active check, both halves of `Filter.svelte`, a state cell and a summary. The two
readers already differ in what "absent" looks like (`''` and `[]` against `undefined`). The sheet
also carries a verbatim copy of `countRoutesByGrade`. Found by the 2026-10-16 code-quality review
(MS-2, with its F1 and F3).

## What Changes

- `filter.ts` gains `writeRouteFilter(params, parsed)`, the inverse of `parseRouteFilter`. It owns
  the omit-defaults rules (an unset value, an empty list, `false`, a rating of 0 are left out) and
  touches only the filter's own keys, in the order `applyFilter` writes them today, so applied URLs
  stay byte-identical.
- `Filter.svelte` seeds its controls from `parseRouteFilter` instead of its own reader, and applies
  through `writeRouteFilter` instead of the nine pairs. The grade slider's index-to-id conversion
  (an end of the range means "no bound") and the sort params stay in the component.
- `routeCountByGrade` calls `countRoutesByGrade` instead of its copy.

Not client-breaking: the URLs a reader can bookmark or share do not change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. A behaviour-preserving refactor, so the change sets `skip_specs: true`.

## Non-goals

- One `draft` state object replacing the sheet's nine control cells, and the grade slider working
  in grade ids rather than indexes (review F1's second half, F6). Larger component restructures,
  each worth its own change.
- The sheet's two modes (search vs. sheet with sort, F2), the four chip-group fields (F5) and the
  second sort parser (F7).
- The activity feed's filter (EV-7), which the review lists beside MS-2 but is a different module.

## Impact

- Code: `src/lib/map/filter.ts`, `src/routes/(app)/(shell)/(explore)/(map)/Filter/Filter.svelte`.
- Tests: a new `src/lib/map/filter.test.ts` (round trip, pinned URL strings).
