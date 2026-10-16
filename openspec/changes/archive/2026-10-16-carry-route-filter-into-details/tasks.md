# Tasks

Apply after `keep-open-entity-on-filtered-map` has landed.

## 1. Shared filter

- [x] 1.1 Add the filter (parsed value plus its `FILTER_PARAM_KEYS` query string) to `src/lib/state/searchQuery.svelte.ts`, written only when it changes; unit test that an equal filter keeps the same reference, seen red by always writing
- [x] 1.2 In `(map)/+layout.svelte`, write it from the URL on explore, search and `areas/[id]/routes`, and read `filters` and `exploreReturn` from it, removing `cachedFilters` and the separate capture; verify by driving: filter by grade, open a block, the map stays filtered, close, `/explore` shows the filter
- [x] 1.3 Append the shared filter's query string to the area detail's link to its route list (`areas/[id]/+page.svelte`) and grep for other in-app links to that route; verify by driving: filter, open an area, open its routes, the list and the map show the filter
- [x] 1.4 Verify the area route list's `Filter` sheet edits the shared filter: change a grade there, close the detail, `/explore` shows it

## 2. Matching set

- [x] 2.1 Publish the matching route ids (null without a filter) and their phase from the layout through the shared module; unit test the null/set cases, seen red by publishing an empty set for no filter

## 3. Detail screens

- [x] 3.1 i18n: add the match count keys (for example `routes_matchCount` "{matching} of {total} routes match your filters" and a short row form) to `messages/en.json` and `messages/de.json` via `add-i18n-keys`
- [x] 3.2 Block detail: heading uses the match count through `summaryOf`; `RouteList` / `RouteRow` take `dimmed`; add a dimmed story to `RouteRow.stories.svelte`; verify by driving a block with some matching routes
- [x] 3.3 Area detail: "n of N" route count and per-block counts in `BlocksList.svelte`; verify by driving under a grade filter
- [x] 3.4 `GradeHistogram`: optional `matchingByGrade` drawn over the faded totals with both numbers in each bar's accessible label; add a story; verify in Storybook light and dark

## 4. Indicator

- [x] 4.1 i18n: add the indicator's filter labels ("Filters on", "{search} + filters") to both locales via `add-i18n-keys`
- [x] 4.2 Extend the indicator offer in `(map)/+layout.svelte` to show for a filter alone and name both; clear empties search and filter, and on `areas/[id]/routes` replaces the URL without the filter keys; verify by driving: clear on a block detail and on an area route list, then close, `/explore` is unfiltered

## 5. Verification sweep

- [x] 5.1 Over the touched paths: `npx prettier --write`, `npx eslint`, `npx vitest run --project browser` for the touched tests, `./node_modules/.bin/svelte-check --tsconfig ./tsconfig.json`, `npm run lint:duplication`, `npm run lint:unused`; all green
- [x] 5.2 Drive at 375x667 and 1280x800 in both themes: grade filter carried onto a block and an area, match counts and dimmed rows, chart overlay, area route list filter round trip, a fresh deep link unfiltered, indicator wording and clear; close the pages opened and report the browser free
