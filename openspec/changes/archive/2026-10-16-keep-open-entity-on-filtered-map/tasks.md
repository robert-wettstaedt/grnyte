# Tasks

## 1. Narrowing the markers

- [x] 1.1 Keep `name` in `routeMapList`'s mapper (`src/lib/entities/route/resources.svelte.ts`) and widen `filteredRouteList`'s row type if it needs it; verify with svelte-check
- [x] 1.2 Add pure `narrowBlocks` in `src/lib/map/narrow.ts` (search by block, area and route name; route filter; open block or open area subtree added back; reference-equal source when nothing narrows) with `narrow.test.ts` covering every `map/marker-search` narrowing scenario; verify `npx vitest run --project browser src/lib/map/narrow.test.ts` passes and has been seen red by dropping the add-back
- [x] 1.3 Replace `searchBlockIds` / `blocks` in `src/lib/map/exploreData.svelte.ts` with `narrowBlocks`, taking an `open` getter; verify svelte-check and that `/explore` with no search keeps its markers
- [x] 1.4 Derive `open` in `(map)/+layout.svelte` from `entityOf` and `page.params.id` and pass it in; verify by driving the unhappy path (search "Rubber Gun", `/routes/738`, breadcrumb to block): block drawn, framed, Show offered

## 2. Search indicator on detail screens

- [x] 2.1 Add the `dismiss` offer kind to `src/lib/state/pill.svelte.ts`, ranked with `action`; extend `pill.svelte.test.ts` so a `dismiss` beats syncing and a status, seen red by ranking it as a status
- [x] 2.2 Render the `dismiss` face in `StatusPill.svelte` (quiet surface, leading icon, inert label, separate 32px clear button, matching the other faces' height) and add a story to `StatusPill.stories.svelte`; verify in Storybook light and dark
- [x] 2.3 i18n: add the clear control's accessible name (for example `map_clearSearch`) to `messages/en.json` and `messages/de.json` via `add-i18n-keys`; verify both locales build
- [x] 2.4 Offer the indicator from `(map)/+layout.svelte` while a detail is open, not on `/search`, with non-empty search text; the clear calls `setLiveSearchQuery('')`; verify by driving: chip shows on a block detail under a search, clear restores every marker and keeps the sheet open, closing then shows an empty bar

## 3. Route detail Show

- [x] 3.1 Promote `ShowOnMapButton` to `$lib` with an optional `href` and use it in `src/routes/(app)/routes/[id]/RouteActions.svelte` ( `entityHref('blocks', route.blockFk)`, only when `destination` is defined) and a no-pin story in `RouteActions.stories.svelte`; verify by driving: Show opens the block framed, Back returns to the route, a pinless block shows no Show

## 4. Verification sweep

- [x] 4.1 Over the touched paths: `npx prettier --write`, `npx eslint`, `npx vitest run --project browser` for the touched tests, `./node_modules/.bin/svelte-check --tsconfig ./tsconfig.json`, `npm run lint:duplication`, `npm run lint:unused`; all green
- [x] 4.2 Drive at 375x667 and 1280x800: happy path, unhappy path, an area opened under a non-matching search, chip clear, route Show and Back, and typing a route name on region 18 without visible lag; close the pages opened and report the browser free
