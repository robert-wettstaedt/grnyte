# Proposal

## Why

Selecting a block's marker zooms the map out. The framing carries `zoom: 16`, and a point framing
lands on exactly that scale, so a reader working at street level is pulled back every time they pick
the next block. Asking to be located already refuses to reduce the scale, and a reader cannot tell
why one of the two respects the view they set up and the other does not.

## What Changes

- Framing a point keeps the reader's scale when it is already closer than the scale the framing asks
  for. This covers selecting a block or parking marker, opening their detail, and asking for the open
  entity to be shown on the map.
- A framing states a floor rather than a target, through a new `minZoom` on `MapFocus`. `zoom` keeps
  meaning exactly this scale, so the framings that must set a scale still can.
- Asking to be located and the quick-create recentre both compute this floor by hand today. Both move
  onto the one rule, and the recentre stops reading a snapshot of the last view change in favour of
  the live scale.
- The scale the entity framings ask for becomes a named constant beside the map's other zoom
  thresholds. Its value does not change.
- Framing an area keeps setting its scale from the extent of the blocks beneath it, because a floor
  there would refuse to show the area.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `map/camera-ownership`: the requirement "Asking to be located arrives at a scale that shows
  something" becomes a requirement about every framing that targets a point, not only the locate
  press. Restoring a remembered camera and a picker's own framing are stated as unaffected, since both
  are point framings that must land on an exact scale.

## Non-goals

- No ceiling on the scale that is kept. A reader at a very close scale who selects a distant marker
  arrives at that scale, with little around them to recognise. This matches what asking to be located
  already does, and a cap is a second threshold with no better justification than the first.
- Framing an area is untouched.
- Who owns the camera is untouched. This changes how a framing computes its scale, not when it is
  allowed to apply.
- No change to the value of the entity framing scale, to the content framing, or to the map's zoom
  controls.

## Impact

- `src/lib/map/camera.svelte.ts`: `applyFocus` resolves the floor, `locatePressed` reads the same
  helper.
- `src/lib/map/types.ts`: `MapFocus` gains `minZoom`, and the entity framing scale is named here.
- `src/routes/(app)/(shell)/(explore)/(map)/cameraTarget.ts`: the block and parking framings state a
  floor.
- `src/routes/(app)/(shell)/(explore)/(map)/+layout.svelte`: the quick-create recentre states a floor
  instead of computing one.
- Tests: `src/lib/map/camera.svelte.test.ts` and
  `src/routes/(app)/(shell)/(explore)/(map)/cameraTarget.test.ts`.
- No entity module, no route, no table, no remote function and no URL is touched, so nothing here is
  client-breaking and an already-loaded tab keeps working across the deploy.
- No user-facing copy, so no i18n keys.
