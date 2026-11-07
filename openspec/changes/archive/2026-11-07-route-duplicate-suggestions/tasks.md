# Tasks

## 0. Subtract first

- [x] 0.1 Merge the two `import type` lines from `./dto` in `RouteFormFields.svelte`, and verify with eslint and `RouteFormFields.svelte.test.ts`.
- [x] 0.2 Remove the empty-query branch of `filtered` in `TopoAddRouteModal.svelte`, since `includes('')` already keeps every candidate, and verify in the running app that the step 1 list shows every candidate with an empty search and narrows when typing.

## 1. Matcher

- [x] 1.1 Add `similarNames(rows, block)` and `match(name)` to `src/lib/entities/route/similarNames.ts` starting from an exact match on the same block, then add normalization and edit distance as internals, and verify only through `match` that case, accents, `ß`, punctuation, spacing and a neighbour swap behave as specified, one red and green cycle each.
- [x] 1.2 Add the word-by-word typo rule (same word count, 1 edit at 4 to 7 characters, 2 at 8 or more, digits exact, different first letter only at 8 or more), and verify with the labelled duplicate and distinct pairs from `design.md` as table tests, plus "Vinterreise" and "Winterreise", which the original pairs lack.
- [x] 1.3 Add the nearby rule (start of name from 3 characters, shared uncommon word, at most 2 names per region) and the under-3-characters rule, and verify with tests that the same pair matches on the block or in the sector and not elsewhere.
- [x] 1.4 Add ranking and the cap of three, and verify with tests for the order of match kinds, then block, sector and region, with a stable tie break.
- [x] 1.5 Run `npm run test:mutation -- --mutate src/lib/entities/route/similarNames.ts`, and verify by reading the survivor list and adding a test for each survivor that changes behaviour. Thresholds are the point of this module, so a surviving boundary is a gap.

## 2. Reads

- [x] 2.1 Add `areaIds` to the `routeMapList` mapper in `src/lib/entities/route/resources.svelte.ts`, and verify by typecheck that `/explore`'s callers are unaffected.
- [x] 2.2 Add `src/lib/entities/route/similarMatches.svelte.ts` (first-focus `enabled`, `quietly`, `debouncedQuery`, derived normalized names and word counts, top ids to `routesByIds`), and verify with a test that a keystroke leaving the same top ids causes no second `routesByIds` build.
- [x] 2.3 Add the hold while the name field lacks focus, and verify with a test that rows arriving after blur leave the returned list unchanged, and that focusing again updates it.
- [x] 2.4 Keep the previous rows until the next set has hydrated, and verify with a test that a new set of top ids does not empty the returned list while it loads, and that a cleared name does.

## 3. Copy

- [x] 3.1 Add `routes_form_similarAnnouncement`, `routes_form_similarExact` and `routes_form_similarHeading` from `design.md` through `add-i18n-keys` to `messages/en.json` and `messages/de.json`, and verify both locales build, keys stay sorted, there are no em-dashes, and the strings match the Copy table.

## 4. Add page

- [x] 4.1 Add `src/lib/entities/route/SimilarRoutes.svelte` (one group of `RouteRow`s with `variant="option"`, crumbs and `description: ''`, bidirectional `slide` and `animate:flip` with `motion()`, `role="status"`, nothing when empty, exact-match wording), and verify with a component test for the rendered content, and that tapping a row leaves the name unchanged.
- [x] 4.2 Add the preview `Modal` with the route's name as title, its description and tags, and the default `routes_showDetails` link from `entityHref`, and verify with a component test that closing it keeps form values.
- [x] 4.3 Render `SimilarRoutes` from `RouteFormFields.svelte` when `route == null`, add the `similar` prop and mock the component in `RouteFormFields.svelte.test.ts`, and verify with tests that the add form shows it and the edit form does not.
- [x] 4.4 Add an `active:` press background to `Row.svelte` for rows with `href` or `onclick`, and verify by holding a real press on a row at 375x667 that it highlights on press, and that rows stay transparent at rest.

## 5. Topo editor

- [x] 5.1 Pass `similar` from `TopoAddRouteModal.svelte`, offering `topo_addRouteToPhoto` only for ids in `candidates`, closing the preview and awaiting `tick()` before `pick`, and verify in the running app at 1280x800 that `aria-hidden` is gone from the app after each path, as jsdom cannot cover the focus trap.
- [x] 5.2 Drive all three topo paths (same block not on this photo, same block on this photo, other block), and verify unsaved lines survive each one at 375x667 and 1280x800.

## 6. Integration

- [x] 6.1 Measure first-focus load and typing on region 18 "Volume Test" with a throttled phone profile, and verify by recording the numbers in the change. Report to the user before going further if typing visibly lags.
- [x] 6.2 Check the network while typing a long name, and verify `listRoutesForMap` registers once per form and `listRoutes` only when the top ids change.
- [x] 6.3 Drive the add page against the spec's scenarios with `maintainer@` in region 2, including another region's name, a merged route's name, an offline load, and uploads in progress when leaving through "Show details" compared with Cancel, at 375x667 and 1280x800, and record in `design.md` how far the list reaches at that size, since a real phone keyboard is out of scope.
- [x] 6.4 Confirm the fields below do not move after blur on a throttled load at 375x667, and verify by watching the grade picker's position while late rows arrive.
- [x] 6.5 Type and delete letters quickly at 375x667 and 1280x800, in English and German and in both themes, with reduced motion on and off, and verify the list does not collapse between letters, closes smoothly, a long name ellipsizes, and a tap while the name field has focus lands on the intended row and opens the preview.
- [x] 6.6 For every new test, make one production edit that should break it, see it red, revert, and verify by grepping that each mutation actually applied.
- [x] 6.7 Run the sweep over the touched paths: `npx prettier --write`, `npx eslint`, `npx vitest run --project browser`, `./node_modules/.bin/svelte-check --tsconfig ./tsconfig.json`, `svelte-autofixer` on the new Svelte files, `npm run lint:duplication`, `npm run lint:unused`, and verify all pass and the app has been driven at 375x667 and 1280x800.

## Workflow follow-up

- Offer `/review-loop` after implementation.
- Archive the change after review, which creates `openspec/specs/guidebook/duplicate-suggestions/spec.md`.
