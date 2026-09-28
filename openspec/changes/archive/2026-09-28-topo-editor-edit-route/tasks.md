# Tasks

## 1. Shared form component

- [x] 1.1 Add an `allowMedia` prop to `RouteFormFields.svelte`, defaulting to true, and gate the
      media block on `route == null && allowMedia`. Verify the existing add-route page still renders
      its media picker and that passing `allowMedia={false}` removes it, in Storybook or the running
      app.

## 2. i18n

- [x] 2.1 Add `topo_editRoute` to both `messages/en.json` and `messages/de.json`, kept sorted, no
      em-dashes. Reuse `common_saved` for the save confirmation and `common_cancel` / `common_save`
      for the form's controls rather than adding near-duplicates. Verify by grepping both files for
      the new key and confirming the counts match.

## 3. The edit surface

- [x] 3.1 Create `TopoEditRouteModal.svelte` in the editor's route folder: a `Modal` with the same
      geometry as `TopoAddRouteModal` (`backdrop`, `panel`, right-edge panel on desktop, sheet on
      mobile), its body behind `{#if open}` so it mounts per open. Verify it opens and closes over
      the editor at 1280x800 and 375x667.
- [x] 3.2 Wire the modal's data: a `routeDetail` resource enabled only while it is open, a latched
      `hydratedId` effect, and a loading state until the latch fires with `OfflineNotice` when
      offline. Verify by opening it for a route whose related rows are not yet local and seeing the
      loading state resolve, and by opening it offline and seeing the notice.
- [x] 3.3 Seed the form through `seedOnKeyChange` keyed on `hydratedId`, including
      `known: routeListsFingerprint(data.tags, data.firstAscents)` and a hidden input for it, and
      render `RouteFormFields` with `allowMedia={false}` inside `{#key detail.id}`. Verify a
      name-only save keeps every tag and first ascensionist.
- [x] 3.4 Reseed the shared `updateRoute` singleton on every open, WITHOUT a DOM reset: `reset()`
      blanks the rendered name, and the following `fields.set` writes the value the singleton
      already held, so nothing re-renders and the form submits an empty name over a real one.
      Verify that opening the modal for route A, closing it, and opening it for route B shows B's
      values with none of A's, and that reopening the SAME route still shows its name.
- [x] 3.5 On a successful save, close the modal and show the saved confirmation. Verify the card
      behind it reflects the new name and grade without a reload.

## 4. The editor wiring

- [x] 4.1 Add the Edit action to `TopoRouteCard.svelte` beside Delete, behind a `canEdit` prop, and
      remove the unreachable `|| m.topo_quickLine()` fallback from the name. Verify a nameless route
      now reads the same as it does on the block page, and that the action is absent for a user
      without edit permission.
- [x] 4.2 Hold the modal's open state and the `canEditRoute` gate in the editor page, pass them to
      the card and the modal, and name the open handler something other than the page's existing
      `editRoute`, which means "select". Verify selecting a route and pressing Edit opens the modal
      for that route.

## 5. Keyboard

- [x] 5.1 Add an `onEditRoute` option and an `e` branch to `keydown.ts`, firing only with a route
      selected, plus a predicate that makes the whole handler inert while a route form is open,
      checked before every other branch. Verify with new cases in `keydown.test.ts` covering: `e`
      with a selection opens, `e` with none does nothing, and `1`, `j` and `escape` do nothing while
      the form is open.
- [x] 5.2 Confirm each new `keydown.test.ts` case has been seen red before it passes: delete the `e`
      branch and the early return in turn, run the test, revert. Verify by naming the edit made and
      the assertion that failed.

## 6. Add-modal parity

- [x] 6.1 Replace `TopoAddRouteModal`'s step 2 fields with `RouteFormFields` (`allowMedia={false}`,
      no `route`), dropping its own `blockId` hidden input and the now-unused `gradeFk` and `tags`
      state. Verify creating a route from the editor with a rating, description, first ascent year
      and first ascensionists persists all of them, and that "Quick line" still posts an empty route.
- [x] 6.2 Confirm the taller step 2 is usable at 375x667: the sheet scrolls, the header's save button
      stays reachable, and the step 1 footer's clearance comment still holds. Verify by driving it at
      that size.

## 7. Verification sweep

- [x] 7.1 Over the touched paths only: `npx prettier --write`, then `npx eslint`. Verify both exit
      clean.
- [x] 7.2 `npx vitest run --project browser` for the touched `*.test.ts` outside server scope, and
      `--project server` if any server test is touched. Verify all pass.
- [x] 7.3 Typecheck. Beside a running dev server use
      `./node_modules/.bin/svelte-check --tsconfig ./tsconfig.json`, not `npm run check`. Verify no
      new errors.
- [x] 7.4 `npm run lint:duplication` and `npm run lint:unused`. Verify no `[NEW]` clone is reported;
      the add modal losing its hand-rolled fields should reduce duplication, not add any.
- [x] 7.5 Drive the running app at both 375x667 and 1280x800: select a route, edit every field, save,
      reopen, create a route through the full new-route form, and confirm the permission gate by
      signing in as a user without edit rights. Verify with screenshots at both sizes.
