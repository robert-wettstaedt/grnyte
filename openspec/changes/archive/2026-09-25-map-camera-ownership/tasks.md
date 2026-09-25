# Tasks

## 1. The ownership reducer

- [x] 1.1 Add `src/lib/map/cameraOwner.ts`: the owner type (the reader's location, an entity with its
      key, or the reader) and a pure `nextOwner(current, event)` implementing every transition in
      `specs/map/camera-ownership/spec.md`. Verify it exports only the type and the function, and
      that `svelte-check` passes.
- [x] 1.2 Add `src/lib/map/cameraOwner.test.ts` covering each transition and each case where a mover
      may not write. Verify it has been seen red first: invert one transition so a location fix
      claims ownership, run the test, confirm it fails, revert, confirm it passes.
- [x] 1.3 Run `npm run test:mutation -- --mutate src/lib/map/cameraOwner.ts` and read every survivor.
      Verify no survivor describes a real gap in the transition table, and note any that are
      equivalent mutants.

## 2. Wiring ownership into the map

- [x] 2.1 Hold the owner as `$state` in `Map.svelte` and pass a read plus claim pair into
      `setupGeolocation` in place of `getHasFocus`. Verify by driving `/explore` that the locate
      button still centres and follow mode still tracks.
- [x] 2.2 Split the focus value's owner key from its framing numbers in `Map.svelte`: apply the
      framing when the owner key changes, and on a framing-only change only while that owner still
      holds the camera. Verify by opening a block detail, panning immediately, and confirming the
      camera stays where it was panned once the row lands.
- [x] 2.3 Gate the one shot block fit on the camera being unowned and delete the `hasAutoFitted`
      latch. Verify closing a detail sheet back to `/explore` no longer reframes the whole region,
      and that a first arrival at `/explore` still frames the blocks.

## 3. The owner key in the explore layout

- [x] 3.1 Derive the owner key from the route parameters in the `(map)` layout and include it in the
      focus value, so it is set before any row syncs. Verify a deep link to `/blocks/<id>` with
      location permission already granted keeps the block framed when a fix arrives afterwards.
- [x] 3.2 Claim for the reader on a popstate restore, keeping the existing precedence in which an
      entity's own framing wins on its own screen. Verify going back to a screen with no entity of
      its own restores the camera, going back to an entity frames the entity, and a later location
      fix moves neither.

## 4. Follow mode

- [x] 4.1 In `geolocation.ts`, claim the camera on permission driven arming only when nothing owns
      it, replacing the one shot `getHasFocus` read. Verify the marker still appears in that case
      while the camera stays put.
- [x] 4.2 Cancel follow on a keyboard pan, reusing `ReorderMap.svelte`'s `PAN_KEYS` keydown pattern.
      Verify at 1280x800 that arrow keys stop the camera following, and that the zoom controls still
      do not.
- [x] 4.3 Apply the locate zoom floor of `BLOCK_LABEL_ZOOM`, mirroring the quick-create framing.
      Verify pressing locate from the world view zooms in to at least that level, and from a closer
      view leaves the zoom unchanged.

## 5. Sheet aware framing

- [x] 5.1 Replace the hardcoded `window.innerHeight * 0.75` padding in the `(map)` layout with
      `sheetState.sheetTop`, read inside `untrack()`, and add a one line comment saying why it is
      untracked. Verify framing an entity with the sheet collapsed centres it rather than pushing it
      into a top strip, and that dragging the sheet moves the camera not at all.

## 6. The Show action

- [x] 6.1 i18n: rename `routes_showOnMap` to `map_showOnMap` in both `messages/en.json` and
      `messages/de.json`, update its two `RouteRow` call sites, and add `map_show` ("Show" / "Zeigen")
      to both files, keys kept sorted. Verify no reference to the old key remains and both locales
      render the route row and the new action.
- [x] 6.2 Add a show request field to `sheetState` and have the `(map)` layout fold its nonce into the
      owner key. Verify pressing the action twice reframes both times rather than being deduped on
      the second press.
- [x] 6.3 Add the Show tool component, self-hiding when the entity has no coordinates, with `map_show`
      as its caption and `map_showOnMap` as its accessible name. Verify it is absent on a block with
      no pin and present on one with a pin.
- [x] 6.4 Wire it into `BlockActions.svelte`, `AreaActions.svelte` and `ParkingActions.svelte`. Verify
      it appears on all three detail sheets and reframes each entity.

## 7. The action row

- [x] 7.1 Tighten `ActionBar`'s tools gap from `gap-1.5` to `gap-1`, and update its props doc comment
      so it no longer states that the row holds one CTA at most. Verify the six square row fits at a
      360px viewport in German with a three digit favourite count.
- [x] 7.2 Move block's and area's primary action out of the `cta` slot into the tools row as a square
      carrying its primary preset, leaving parking's labelled `cta` untouched. Verify at 360px and
      375px in both locales, with a maintainer login so the primary action is present.

## 8. Verification sweep

- [x] 8.1 Run `svelte-autofixer` (Svelte MCP) on every new or edited `.svelte` until it returns no
      issues or suggestions.
- [x] 8.2 Run `npx prettier --write` and `npx eslint` over the touched paths only. Verify both clean.
- [x] 8.3 Run `npx vitest run --project browser` over the new and changed tests. Verify green.
- [x] 8.4 Typecheck with `./node_modules/.bin/svelte-check --tsconfig ./tsconfig.json`, not
      `npm run check`, whose `svelte-kit sync` step breaks the running dev server. Verify no new
      errors.
- [x] 8.5 Run `npm run lint:duplication` and `npm run lint:unused`. Verify no clone is marked `[NEW]`
      and nothing is newly unused.
- [x] 8.6 Drive the running app at 375x667 and 1280x800, in both `en` and `de`, walking every scenario
      in `specs/map/camera-ownership/spec.md`. Verify each scenario observably holds, and close the
      browser pages afterwards.
- [x] 8.7 Re-read every comment added across the change and cut it to the one or two lines that state
      the non-obvious fact, per AGENTS.md. Verify no comment restates what the code says.
