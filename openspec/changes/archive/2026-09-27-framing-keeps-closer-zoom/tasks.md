# Tasks

## 1. The rule, in the camera

- [x] 1.1 Add `minZoom` to `MapFocus` in `src/lib/map/types.ts`, documented as at least this scale keep
      more, against `zoom` meaning exactly this scale, and name `ENTITY_FOCUS_ZOOM = 16` beside the
      other zoom thresholds. Verify with `svelte-check` over the touched paths, which names every
      caller that needs updating.
- [x] 1.2 Resolve the target scale for a point through one helper in `src/lib/map/camera.svelte.ts`,
      and have both `applyFocus` branches and `locatePressed` use it. Verify the existing
      `camera.svelte.test.ts` suite still passes unchanged, since no current framing sets `minZoom`.
- [x] 1.3 Add tests to `src/lib/map/camera.svelte.test.ts` for a `minZoom` point framing: from a wider
      view it moves in to `minZoom`, from a closer view it keeps the closer scale, and it holds on both
      branches, with padding and without. Verify each has been seen red by deleting the `Math.max` in
      the helper.
- [x] 1.4 Add a test that a framing carrying `zoom` still lands on that exact scale from a closer view,
      which is the history restore, and that a framing carrying an `extent` ignores `minZoom`. Verify
      by making the helper apply to every framing and seeing both fail.

## 2. The producers

- [x] 2.1 In `src/routes/(app)/(shell)/(explore)/(map)/cameraTarget.ts`, have the block and parking
      framings carry `minZoom: ENTITY_FOCUS_ZOOM` instead of `zoom: 16`, and leave the area extent
      framing alone. Verify by updating `cameraTarget.test.ts` to assert the floor, including that the
      area framing carries no `minZoom`.
- [x] 2.2 In `src/routes/(app)/(shell)/(explore)/(map)/+layout.svelte`, make the quick-create recentre
      pass `{ center, minZoom: BLOCK_LABEL_ZOOM }` and drop its own `Math.max` over `mapViewState`.
      Verify the long-press create flow at 375x667 still opens the map at the pressed point without
      widening the view.

## 3. Mutation check

- [x] 3.1 Run `npm run test:mutation -- --mutate 'src/lib/map/camera.svelte.ts' --force` and read every
      survivor around the new helper. Verify no survivor describes a real gap in the floor, and add a
      test for any that does.

## 4. Verification sweep

- [x] 4.1 Drive the running app at 375x667 and 1280x800: select a block marker from a close view and
      from a wide view, open a block and a parking detail, press Show on map after panning away, open
      an area, and go back to an entry whose remembered view is wider than the current one. That last
      one is only reachable from /explore: on an entity route the entity's own framing wins, because
      `effectiveFocus` reads `focus ?? createFocus ?? restoredFocus`. Verify the scale behaves as the
      delta's scenarios state.
- [x] 4.2 Over the touched paths only: `npx prettier --write`, `npx eslint`,
      `npx vitest run --project browser` for the map tests, then
      `./node_modules/.bin/svelte-check --tsconfig ./tsconfig.json` beside the live dev server.
- [x] 4.3 Run `npm run lint:duplication` and `npm run lint:unused`. Verify no new clone is reported,
      which is the check that the three hand-written floors really collapsed into one.
