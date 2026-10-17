# Tasks

## 1. Readiness helpers

- [x] 1.1 Add `summaryOf(phase, value)` beside `expectingMore` in `src/lib/zero/resource.svelte.ts`, with a table test in `src/lib/zero/phase.test.ts` covering answered (zero included), arriving non-zero, arriving zero, loading, partial, unavailable and error; verify the test fails when `summaryOf` returns the value for `arriving` zero
- [x] 1.2 Update the `QueryPhase` doc comment so it no longer says only `answered` may state a total; verify by reading the comment against the delta spec

## 2. Arriving registry and pill state

- [x] 2.1 Create `src/lib/state/pill.svelte.ts` with the arriving `SvelteSet`, `screenSyncing()`, `quietly(fn)`, `offerPillAction` and `offerPillStatus`; verify with a browser-project unit test that a withdrawn offer clears and that action outranks status outranks syncing
- [x] 2.2 Register arriving resources from the `Resource` constructor unless built inside `quietly`; extend `src/lib/zero/resource.svelte.test.ts` so a resource joins the set while `arriving`, leaves on `answered` and on cleanup, and never joins inside `quietly`; verify each new case fails with the registration removed
- [x] 2.3 Wrap the six resource factories in `setGlobalState` (`src/lib/state/global.svelte.ts`) in `quietly`; verify with a test or dev probe that a reload with only `countUnreadNotifications` arriving leaves `screenSyncing()` false

## 3. One morphing pill

- [x] 3.1 Rework `StatusPill.svelte` into one box whose width transitions while its content crossfades between status and action, with an always-mounted visually hidden `role="status"` region; update `StatusPill.stories.svelte` with a status, an action and a status-to-action story, and verify in Storybook at 375 and 1280 that the box does not jump
- [x] 3.2 Add the pill host to `src/routes/(app)/+layout.svelte` inside the app frame, reading `pill.svelte.ts` with the 250 ms show delay and 200 ms hide linger (actions immediate); verify in the dev app that a fast in-app navigation shows no pill and a Firefox reload of an area page shows one until the routes confirm
- [x] 3.3 Remove the pill branch and the `syncing` snippet prop from `QueryState.svelte`, and the empty `syncing` snippets in `EventLog.svelte` and `(shell)/feed/+page.svelte`; verify svelte-check passes and no list draws its own pill
- [x] 3.4 Make `EventFeed.svelte` offer "N new" through `offerPillAction` instead of rendering a pill; verify in the app that new activity morphs the shared pill into the button and merging works from it
- [x] 3.5 Make the map layout offer `map_loading` through `offerPillStatus` and drop its own `StatusPill`; verify the map shows "Loading map…" with nothing on hand and "Syncing…" while its routes arrive

## 4. Summary sites follow the rows on hand

- [x] 4.1 Area page (`areas/[id]/+page.svelte`): block count, route count, grade chart, section tab counts and sibling nav through `summaryOf`; keep the "no routes yet" branch on `answered`; verify on a Firefox reload that the chart and counts render before confirmation and "No routes yet" still waits
- [x] 4.2 `AreaListItem.svelte`: donut and route total through `summaryOf`; verify a sub-area row shows its donut while arriving and nothing for an arriving zero
- [x] 4.3 Filter counts (`Filter/Filter.svelte` subtitle and grade counts, fed by `settled` from the map layout and `areas/[id]/routes/+page.svelte`): replace `settled` with the summarised values; verify the filter sheet shows counts while arriving
- [x] 4.4 Explore block page (`blocks/[id]/+page.svelte`): route count and sibling nav through `summaryOf`; verify on a reload
- [x] 4.5 Route page (`routes/[id]/+page.svelte`): ascent count, "see all" count, vote count, grade histogram and sibling nav through `summaryOf`; keep the "draw on topo" and block-location gates; verify on a reload and that the empty-ascents line still waits
- [x] 4.6 Route ascents page (`routes/[id]/ascents/+page.svelte`): counts through `summaryOf`, empty line still on `answered`; verify on a reload
- [x] 4.7 Topo viewer and editor (`blocks/[id]/topos/[topoId]/+page.svelte`, `blocks/[id]/topos/edit/+page.svelte`): "n of N" and sibling nav through `summaryOf`; keep the editor's selection and seeding gates; verify both on a reload
- [x] 4.8 `ProfileView.svelte`: tally, hardest grade, histogram and the open and completed project sections through `summaryOf`; keep the own-profile empty state on `answered`; verify another user's profile shows the tally while arriving and the pill stays up until the project lists confirm
- [x] 4.9 `AscentFormFields.svelte`: the previous-notes count through `summaryOf`; verify in the ascent form
- [x] 4.10 Rewrite or delete any test or story that pins the old withholding at these sites, each replacement seen failing against the old gate; verify `npx vitest run --project browser` passes

## 5. Docs

- [x] 5.1 Add one line to AGENTS.md's conventions: a summary value reads `summaryOf`, never `phase.kind === 'answered'`, and only absence, seeding and action gates wait for `answered`; verify the line names the helper that exists

## 6. Verification sweep

- [x] 6.1 Over the touched paths: `npx prettier --write`, `npx eslint`, `npx vitest run --project browser` and `--project server` where touched, `./node_modules/.bin/svelte-check --tsconfig ./tsconfig.json`, `npm run lint:duplication`, `npm run lint:unused`; verify all pass
- [x] 6.2 Drive the dev app in Chrome and Firefox at 375x667 and 1280x800: reload an area page, a route page, another user's profile, the feed with new activity, the map, and a chromeless editor; verify summaries render before confirmation, zeros and "none" claims wait, exactly one pill shows and never blinks, and nothing important sits under it
- [x] 6.3 Close every browser page opened and report the browser free

## 7. Review round 1

- [x] 7.1 Make the pill per surface: `PillSurface`, `createPillSurface`, `pillSurface` in `pill.svelte.ts`; resources resolve their surface at construction; tests updated and each new case seen red
- [x] 7.2 Rename `AppPill` to `PillHost` taking a surface and placement; key the show timer on kind and label; render a host in every `Modal` branch, the shell layout, the map layout and the app root; verify the activity log's "N new" is tappable inside its sheet and a sheet's pill sits in the sheet, not over the map
- [x] 7.3 `StatusPill`: key faces by kind and keep the last width until the incoming face is measured; verify in Storybook that the first status-to-action toggle resizes without a snap
- [x] 7.4 `quietly` around `entitySearch` and the recent lists; verify typing in the explore search shows no pill
- [x] 7.5 Profile: project sections back on `answered`, sends and hardest grade through `summaryOf` on the sends themselves; verify by reading the header props
- [x] 7.6 `toSheetNav` accepts `undefined`; drop the four `?? null`
- [x] 7.7 EventFeed story renders a `PillHost` so "New activity pill" shows the action
- [x] 7.8 Re-run the sweep (prettier, eslint, svelte-check, vitest browser, lint:duplication, lint:unused) and drive the sheet, feed, map and activity log at 375 and 1280

## 8. Review round 2

- [x] 8.1 AGENTS.md describes per-surface pills, `pillSurface().offer` and `quietly`
- [x] 8.2 `StatusPill` measures the current face from one component effect (fractional width), so a face fading back in resizes the box; verified in Storybook with a rapid action/status flip
- [x] 8.3 `PillHost` renders the live offer once it matches what is shown, so an action calls its current handler
- [x] 8.4 Markdown references, `EventMeta`'s lookups and the first-ascent picker are built `quietly`
- [x] 8.5 A resource built outside a component holds no pill instead of throwing; test seen red without the guard
- [x] 8.6 Profile: dead chart skeleton branches and `ascentsShown` removed
- [x] 8.7 Desktop dialog and popover hosts sit beside `Dialog.Description` / `Popover.Description`, outside `aria-describedby`
- [x] 8.8 Sweep: prettier, eslint, svelte-check, vitest browser 1810/1810, lint:duplication, lint:unused

## 9. Review round 3

- [x] 9.1 `StatusPill` finds the current face by `data-face` from one effect; verified on a fresh Storybook (:6008) in both directions at 20, 50 and 100 ms flips (:6006 was serving a stale module)
- [x] 9.2 The feed's person picker and selected person are built `quietly`
- [x] 9.3 `pillSurface()` returns no surface outside component init, so such a resource holds nothing; resources take an explicit `surface` for tests; new test seen red with the old root fallback
- [x] 9.4 Shell pill at `z-30`, above sticky section headings
- [x] 9.5 `PillHost` uses the live offer while its kind matches, keys the delay on kind, and makes a lingering action inert
- [x] 9.6 Chromeless screens: `PageHeader` anchors the root pill and hangs it from its bottom edge; the fixed fallback renders only without a header; anchor count untracked (FormGate tests caught the loop)
- [x] 9.7 EventMeta comment back to two lines; measuring effect no longer re-runs on label changes

## 10. Review round 4

- [x] 10.1 One persistent root host in the `(app)` layout; `PageHeader` publishes its height through `rootPill.anchor` (latest header wins) instead of hosting a pill; verified in Firefox that the pill stays the same element across a header swap and moves below the new header
- [x] 10.2 `PillHost`: the delay runs only from nothing wanted to something wanted, the shown offer follows the live one, the linger clears explicitly, and a lingering action is inert
- [x] 10.3 `StatusPill` measures on a derived kind; the stale SYNCING comment and constant removed
- [x] 10.4 Tests: `PillHost.svelte.test.ts` (delay, kind handoff, immediate action, latest-label linger, inert tap) and anchoring in `pill.svelte.test.ts`, each seen red on its own mutation

## 11. Review round 5

- [x] 11.1 A zero-high (hidden) page header is no anchor; the root host mounts only off shell routes
- [x] 11.2 `ResizeObserver` stubbed only in the two test files that render a measuring component, not globally
- [x] 11.3 Anchoring test reads through an effect (seen red with a plain array); host tests for re-want during the linger, a cancelled delay re-wanted (seen red without the timer cleanup) and the syncing fallback after an action (seen red); the linger guard mutant is equivalent
