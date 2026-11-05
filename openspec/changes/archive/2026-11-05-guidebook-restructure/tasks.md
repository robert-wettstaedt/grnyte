# Tasks

"Seen red" means the named production edit was made, the test failed, and the edit was reverted. DB-backed tests are
`*.server.test.ts` / `*.remote.test.ts` under `--project server`. Starts after `map-block-summaries` has landed.

## 1. Cleanup and vocabulary

- [x] 1.1 Check `drizzle/` for the next free migration number, then add a custom migration deleting `topo_routes` rows whose topo's `block_fk` differs from the route's `block_fk` and run `migrate` (main checkout only); verify with psql that the stale-line count is 0
- [x] 1.3 Add nullable `merged_into` with its `*_merged_is_deleted` CHECK to areas, blocks, routes; `generate:drizzle`, `generate:zero`, migrate the throwaway DB; verify the constraints exist and the catalogue declares the new FKs
- [x] 1.4 Add `refuseMerged` inside the three soft restores; verify server tests that a merged route, block and area each refuse restore with `merge_restoreRefused` and that a direct clear of `deleted_at` fails on the constraint, seen red before the guard
- [x] 1.2 Add **move**, **merge**, **survivor** and **source** to `CONTEXT.md`, and the merge use of `asPrivileged` to AGENTS.md; verify by reading both back against design sections 2 and 8

## 2. Shared derivation

- [x] 2.1 Add `recomputeAreaChains(db, areaIds)` in `area/area.server.ts` built on `areaAncestry` / `areaIdsOf`; verify with a server test that a route two areas below a moved area gets the new chain, seen red by updating only the moved area's own routes
- [x] 2.2 Lift the renumbering loop out of `reorderBlocksRow` into `renumberArea(db, areaId, orderedIds)` and call it from there; verify `reorder.remote.test.ts` and `order.server.test.ts` pass unchanged
- [x] 2.3 Add `parent` and `mergedFrom` to the change catalogue in `event/verbs.ts` as text changes; verify an `EventChanges` story renders a move line with both names

## 3. Picker

- [x] 3.1 Extract the sector chooser from `CreateOnMap.svelte` into `$lib/components/GuidebookPicker/GuidebookPicker.svelte` as a browse list (opens at an area, steps up and down, one level at a time) with `disabled`, `pinned` and an optional search box; switch `CreateOnMap` to it; verify a story per mode and that creating on the map still chooses a sector at both sizes
- [x] 3.2 Add the name search (existing list queries with `content`, sorted by name, higher cap, built `quietly`) that keeps shown rows in place and appends arriving ones; verify a browser test that a row synced after the first render lands below the shown ones, seen red by sorting the whole list on every update

## 4. Route move

- [x] 4.1 Add `routes.move({ routeIds, blockId, knownTopoLines })` in `route/move.server.ts` with client and server mutator defs, gated per design 2, writing `block_fk`, area chains and returning previous block per route; verify server tests for a move and a forged move (refused), each seen red
- [x] 4.2 Add the destination refusals (other region, deleted, under a deleted area) and the same-block no-op; verify one server test each, seen red
- [x] 4.3 Add the stale `topo_routes` delete with the `knownTopoLines` mismatch refusal; verify server tests that lines are gone and that a stale count refuses before any write, each seen red
- [x] 4.4 Write the update event with a `parent` change holding both blocks' display names; verify a server test reading the `changes` row, seen red
- [x] 4.5 Add the named gate in `gates.test.ts` and `moveRoutes` in `route/writes.ts`; verify the gate seen red with the destination check removed

## 5. Block move

- [x] 5.1 Add `blocks.move({ blockIds, areaId, restoreOrder? })` in `block/move.server.ts` with mutator defs, gates, destination refusals and same-area no-op; verify server tests for a move, a sector-holding-areas destination (refused) and a same-area request leaving order untouched, each seen red
- [x] 5.2 Add ordering through `renumberArea`: destination as its blocks plus the moved ones in incoming order, source as what is left, `restoreOrder` for Undo; verify server tests for two blocks keeping order, a gap-free source, and Undo restoring slot 3, each seen red
- [x] 5.3 Add area chains, `refreshAreaType` on both areas and the update event; verify server tests for a route's chain and the area types, seen red
- [x] 5.4 Named gate and `moveBlocks` in `block/writes.ts`; verify the gate seen red

## 6. Area move

- [x] 6.1 Add `areas.move({ areaIds, parentId })` in `area/move.server.ts` with mutator defs, gates (region edit for the top level), cycle check and destination refusals; verify server tests for a move into its own descendant, under a sector, and to the top level by a member without edit rights, each refused, seen red
- [x] 6.2 Add subtree chains, `refreshAreaType` on old and new parents and the update event; verify a server test with a nested area, seen red
- [x] 6.3 Named gate and `moveAreas` in `area/writes.ts`; verify the gate seen red

## 7. Merge foundation

- [x] 7.1 Add the catalogue test listing FK columns to the three tables plus the polymorphic text references, against what the merge modules declare, and a second case for every `text` column named `description`, `notes` or `body` against the rewritten and left-alone lists; verify both fail until groups 7 to 9 declare their columns
- [x] 7.2 Add `mergePreview(kind, sourceId, survivorId)` remote read with its gate entry; verify a remote test for a block's ascent, photo and topo counts and a caller outside the region (refused), each seen red
- [x] 7.3 Add `rewriteReferences(db, kind, sourceId, survivorId)` beside the merge modules, rewriting the design 5 columns with no event; verify server tests that `!blocks:14!` becomes `!blocks:12!` in a description, a comment and a deleted comment, that `!blocks:140!` and a `changes` value are untouched, and that no event is written, each seen red

## 8. Route merge

- [x] 8.1 Add `routes.merge({ sourceId, survivorId, values })` in `route/merge.server.ts` with mutator defs: gates as caller, both rows locked in id order with `deleted_at` re-checked, allowlisted field fill and chosen values, soft delete of the source with `merged_into`, reference rewrite via 7.3; verify server tests for the field rule, a non-allowlisted key (refused), crossing merges (one refused) and a restore request for the merged source (refused), each seen red
- [x] 8.2 Add privileged repointing of ascents, files, tags, first ascensionists (deduped), favorites, import refs, events (non-create), changes, notifications, with the collision rules; verify server tests per collision table and another user's ascent moved, each seen red
- [x] 8.3 Add topo handling (survivor line wins, source lines on other blocks' topos removed) and external links (survivor's kept, source's only when the survivor has none); verify server tests for both, seen red
- [x] 8.4 Add content report handling: collided reports closed through `closeReports`, surviving reports retargeted with name and author refreshed; verify a server test that the reporter gets a `report_closed` notification, seen red
- [x] 8.5 Add the `mergedFrom` event and `recalcUserGradeAndRating`; verify a server test for both, seen red
- [x] 8.6 Named gate and `mergeRoutes` in `route/writes.ts`; verify the gate seen red with the source delete check removed

## 9. Block and area merge

- [x] 9.1 Add `blocks.merge` in `block/merge.server.ts`: routes (deleted included) moved with 5.x helpers, topos, files, the shared table set, pin choice with the losing pin deleted, source area renumbered with `renumberArea`; verify server tests for routes and topos on the survivor, exactly one pin, and a gap-free source area, each seen red
- [x] 9.2 Named gate and `mergeBlocks` in `block/writes.ts`; verify the gate seen red
- [x] 9.3 Add `areas.merge` in `area/merge.server.ts`: refusals (survivor beneath the source, mismatched child kinds), children (deleted included) moved with 5.x and 6.x helpers, parkings only into a sector, `refreshAreaType` on the source's parent; verify server tests for each refusal and a nested child area's routes ending with the survivor's chain, each seen red
- [x] 9.4 Named gate and `mergeAreas` in `area/writes.ts`; verify the gate seen red

## 10. Sheets

- [x] 10.0 Give every new UI component a Storybook story (GuidebookPicker modes, MoveSheet steps, MergeSheet steps including the long-value clamp, the select footer); verify each story renders in Storybook at 375 and 1280
- [x] 10.1 Add i18n keys in `messages/en.json` and `messages/de.json` for move and merge actions, sheet titles, steps, topo warning, counts, the no-undo notice, refusals, select mode, and history lines for a parent change and a merge, via `/add-i18n-keys`; verify both files sorted and `npm run machine-translate` reports nothing missing
- [x] 10.2 Add `MoveSheet.svelte` and wire "Move to..." into `AreaActions`, `BlockActions`, `RouteActions` (close, `await tick()`, then mount; `withUndo`); verify by driving a block move and Undo at both sizes, and that a plain member sees no Move
- [x] 10.3 Add `MergeSheet.svelte` (survivor with siblings pinned, stacked field choices clamped with a sliding "more", red confirm with preview counts and the no-undo notice) and wire "Merge into..."; verify a browser test that the fields step is skipped with nothing differing, and drive a route merge with a grade conflict at both sizes, checking the DB afterwards
- [x] 10.4 Add select mode with a "Move N to..." footer to the block list in `areas/[id]`, the route list in `blocks/[id]` and the child area list; verify by driving a three-route move at both sizes
- [x] 10.5 Verify parent changes and `mergedFrom` render in entity history from the 2.3 catalogue entries, by opening a moved block's and a survivor's history in the app

## 11. Verification sweep

- [x] 11.1 Over the touched paths: `npx prettier --write`, `npx eslint`, `npx vitest run --project server` and `--project browser`, `svelte-check` (beside a live dev server), `npm run lint:duplication`, `npm run lint:unused`, `svelte-autofixer` on new Svelte files; verify all green
- [x] 11.2 Drive the running app at 375x667 and 1280x800: move a route, a block and an area and undo each; bulk move; merge two routes, two blocks and two areas; open a merged source's URL (not found) and a description and a comment referencing it (survivor shown); tab through both sheets on desktop and confirm the app is not left `aria-hidden` after closing; close the pages and report the browser free

## 12. Review follow-up (decided 2026-11-01, from the review loop and a driven pass)

- [x] 12.1 History names in the reader's language. A move's `parent` and a merge's `mergedFrom` store the raw name; a nameless row stores a marker the renderer turns into "Unnamed" / "Block n" in the reader's locale (an empty string cannot be the marker: `changed()` reads `''` and null as equal, so a nameless merge would record nothing). New pair format for these two fields; update the event cases and the merge/move tests; verify a nameless block merge renders "Block 3" in en and de
- [x] 12.2 Sheet height on phones: let `Modal.mobile` take more than one snap point with the largest as the maximum (today `maxHeight` is `snapPoints[0]`, so nothing can be dragged taller); check svelte-bottom-sheet supports it first. Move, merge and select sheets open at 0.6 and drag to 0.9; verify by dragging at 375
- [x] 12.3 Picker header: a title naming what moves or merges ("Move block "Fixture Keep""), then a tappable breadcrumb of the browsed level (region › area › …) replacing the Up button and the level heading; keep search and "Move into" plus the level's name; verify drilling down and jumping back two levels at both sizes
- [x] 12.4 Picker rows: every area row carries its type badge (Area / Sector, the page-header chip). A row that cannot take what moves is dimmed with no text, since the badge says why (drop `areas_holdsBlocks` / `areas_holdsAreas` reasons and their keys if unused); text reasons stay only for "Already here", "No edit rights" and "Can't go inside itself". Same badges and dimming in the area merge picker; drop the row crumb that repeats the breadcrumb
- [x] 12.5 Multi-select from the list itself: each list gets a heading row ("2 ROUTES", and on area pages a new "N BLOCKS" / reuse "AREAS"), with a plain-text "Select" at its trailing end that turns the rows into checkboxes in place ("Done" to leave) and shows a bottom bar "Move N … to…" that opens the move sheet. Replaces `BulkMove`'s button and checklist sheet (`SelectChecklist` and its stories go if unused). Reserve the heading row's space so nothing inserts above a rendered list; verify at both sizes, both themes, en and de
- [x] 12.6 Re-run the driven review on :3010 over 12.1-12.5

## 13. Screen review follow-up (decided 2026-11-05, from the screenshot inventory)

- [x] 13.1 "Move to…" uses lucide `folder-input` instead of `move`, so it no longer reads as dragging on a canvas or as the map pin's "Move on the map"
- [x] 13.2 Every move-sheet row that cannot be picked is dimmed the same way; "Can’t go inside itself" and "It’s already here" keep their reason as a second line
- [x] 13.3 Move sheet confirms through one fixed footer button (`Modal` `footer`, as in `TopoAddRouteModal`). Every destination is opened before it is confirmed, blocks and routes included: a sector opens to show its blocks, a block opens to show its routes, read-only. The footer names the opened level ("Move to Sector Two", "Move to the top level") and is disabled with a hint where the level cannot take what moves ("Open a sector", "Open a block", "It’s already here"). A search result opens its place instead of moving. The topo-line warning stays as the step after the button
- [x] 13.4 Picker lists in the move and merge sheets fill the sheet instead of a fixed height, so 90% shows more rows
- [x] 13.5 Merge picker: blocks and areas list only the nearby ones while browsing; the rest of the region appears through search, as routes already do
- [x] 13.6 Undo or close on the "Moved to" notice no longer drops the explore sheet to its lowest height
- [x] 13.7 The "Moved to" notice dismisses itself after 10 s (other Undo notices stay, because a delete navigates away; a move does not), and a list in select mode leaves room under its last row for the bottom bar
- [x] 13.8 Merge preview: "Photos and videos" leaves out files that are topos, so a topo photo is counted once
- [x] 13.9 German merge headline uses "vereint", matching the "Vereint" line label
- [x] 13.10 A nameless block gets the same "Block n" in the sector list, the move sheet and the merge sheet (checked: already the same everywhere at any moment; the number follows the block's position, so it changes with a neighbour's move. No code change)
- [x] 13.11 Over the touched paths: prettier, eslint, scoped vitest, svelte-check, jscpd, knip, svelte-autofixer; drive each change at 375 and 1280; re-shoot the affected screens and republish the screen inventory artifact

## Workflow follow-up

- Run `/review-loop` on the finished implementation.
- Archive the change after review.
