# Design

## Context

See proposal.md for the why. What decides the how:

- `applyFilter` writes onto a copy of the current URL with `set`/`delete`, so params the filter does
  not own (`sort`, `dir`, anything else) are kept, an existing key keeps its position, and a new key
  is appended. The append order is the order of the nine pairs, which is also `FILTER_PARAM_KEYS`'
  order. A shared link or bookmark is that string, so its bytes are the contract.
- The two readers agree on values and differ only in their "absent" spelling: `toggleOpen` produces
  `''` for no ascent status, `[]` for no tags or first ascensionists and `0` for no rating, where
  `parseRouteFilter` produces `undefined`. Mapping one to the other at the seed is mechanical.
- The grade slider works in indexes into `global.grades`; the URL stores grade ids, and an index at
  either end of the range writes no bound. That mapping needs the grade list, which `filter.ts` does
  not have and should not take.

## Goals / Non-Goals

**Goals:**

- One reader and one writer of the filter's URL, side by side in `filter.ts`.
- Every URL the sheet applies today comes out byte-identical.

**Non-Goals:**

- Restructuring the sheet's control state (see proposal.md).

## Decisions

1. **`writeRouteFilter(params: URLSearchParams, parsed: ParsedRouteFilter): void`.** Mutates the
   params it is handed, like the code it replaces, so the caller keeps building on its `SvelteURL`
   and the sort params stay the caller's. Rejected: returning a new string, which would make the
   caller re-merge the params the filter does not own.
2. **The writer sets in `FILTER_PARAM_KEYS` order** and deletes a key whose value is a default
   (`undefined`, an empty list, `false`, a rating `<= 0`). That reproduces today's positions and
   omissions exactly, and a key added to the list later is written in the same place.
3. **The grade bound stays an id-or-undefined in `ParsedRouteFilter`.** `Filter.svelte` turns an end
   index into `undefined` before calling the writer, as it does today before its `delete`.
4. **The seed reads `parseRouteFilter`** and maps `undefined` to the controls' empty values (`''`,
   `[]`, `0`); media is `hasTopo`/`hasBeta` in that order, as now.

## Risks / Trade-offs

- [An applied URL changes bytes] → `filter.test.ts` pins full URL strings for representative states:
  every key set, every key cleared, unrelated params (`sort`, `dir`, a foreign key) kept in place,
  and a stale key from an earlier filter removed. A round trip `parse(write(x))` covers the values.
- [The seed shows something different on open] → driven: open the sheet over URLs with each filter
  set and check every control, at 375x667 and 1280x800, on the explore layout and on the area routes
  page (the sheet with sort).

## Migration Plan

None: no data, no URL change. Rollback is reverting the commit.
