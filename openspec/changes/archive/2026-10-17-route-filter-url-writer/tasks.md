# Tasks

## 1. Writer, proven first

- [x] 1.1 Add `writeRouteFilter(params, parsed)` to `src/lib/map/filter.ts`: sets the filter's keys
      in `FILTER_PARAM_KEYS` order and deletes each one whose value is a default (`undefined`, empty
      list, `false`, rating `<= 0`); touches no other key.
- [x] 1.2 Add `src/lib/map/filter.test.ts`: `parse(write(x))` round trips; pinned URL strings for
      every key set, every key cleared, unrelated params (`sort`, `dir`, a foreign key) kept in place,
      and a stale key removed. Pin the strings to what today's `applyFilter` produces for the same
      inputs, and see it red once (e.g. by swapping two keys' write order).

## 2. Sheet

- [x] 2.1 `Filter.svelte` `toggleOpen`: seed the controls from `parseRouteFilter(page.url.searchParams)`
      instead of reading the params by hand; the sort seed is unchanged.
- [x] 2.2 `Filter.svelte` `applyFilter`: build a `ParsedRouteFilter` from the controls (an end-of-range
      grade index becomes `undefined`) and call `writeRouteFilter` on the `SvelteURL`'s params; the
      sort writes are unchanged.
- [x] 2.3 `routeCountByGrade` calls `countRoutesByGrade`; drop the copy and its eslint-disable.

## 3. Verification sweep

- [x] 3.1 Over the touched paths: `npx prettier --write`, `npx eslint`,
      `npx vitest run --project browser src/lib/map`, and `svelte-check` (beside a running dev server).
- [x] 3.2 `npm run lint:duplication` and `npm run lint:unused`.
- [x] 3.3 Drive at 375x667 and 1280x800, on the explore map's filter and on an area's routes sheet
      (with sort): apply filters together and clear some, compare the resulting URL with what the
      previous `applyFilter` writes for the same steps (its order and encoding, as pinned in 1.2; the
      shared checkout cannot serve the previous commit side by side), reopen and check every control
      seeds from the URL, and Reset.
