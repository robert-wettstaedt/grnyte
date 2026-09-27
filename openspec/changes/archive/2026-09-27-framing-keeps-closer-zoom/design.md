# Design

## Context

See proposal.md for motivation. Three facts decide the approach.

`applyFocus` frames a point through `view.fit([x, y, x, y], { maxZoom })` when the framing carries
padding, and `view.animate({ center, zoom })` when it does not. A degenerate extent has no size, so
the fit resolves to `maxZoom` exactly. Both branches therefore already have one place where the target
scale is chosen.

Three producers send a point framing, and they do not want the same thing. The entity framings from
`cameraTarget` want a floor. The history restore in the explore layout wants the exact remembered
scale. The location pickers want the scale they were built with, which the spec already states as a
picker keeping the framing it was given.

`locatePressed` and the quick-create recentre each compute `Math.max(currentZoom, threshold)` by hand.
The recentre reads `mapViewState`, which is the last value `onviewchange` emitted rather than the live
view.

## Goals / Non-Goals

**Goals:**

- One place resolves a scale floor, and the framings that want one say so rather than compute one.
- The camera stays testable without a map, a DOM or a layout, so each scenario in the delta is a unit
  test against the fake view.

**Non-Goals:**

- No change to ownership, to the dedupe keys, or to the framing count.
- No new state in the camera. The floor is resolved from the view at the moment of the move.

## Decisions

**A framing states a floor, through `minZoom` on `MapFocus`.** `zoom` keeps meaning exactly this
scale. `minZoom` means at least this scale, keep more. A framing sets one or the other.

The alternative was to infer the floor from the claim, since the entity framings hold an `entity`
claim and the other two producers hold a `reader` claim or none. Rejected: it ties how a framing
computes its scale to who owns the camera, and those line up today by coincidence. The history restore
being a reader claim and the pickers having no claim are both facts that could change without anyone
thinking about scale, and the failure would be silent in the direction that matters, a restore that
refuses to zoom out. An explicit field also makes a new producer opt in.

Computing the floor in `cameraTarget` instead was rejected for a second reason. `applyFocus` keys its
dedupe on `JSON.stringify({ c, e, z })`, so a framing that carried the live scale would change identity
on every pinch, and the dedupe that stops the parent's recomputations from re-framing would stop
working.

**The floor is resolved at the moment of the move, from `view.getZoom()`.** Same as `locatePressed`
does now, and it is the only reading that is true when the move starts. This is what takes the
quick-create recentre off its snapshot.

**One helper, used by both callers.** `applyFocus` and `locatePressed` resolve their target scale
through the same small function in `camera.svelte.ts`, so the rule the spec states once exists once.

**`minZoom` applies only to a point.** The extent branch ignores it and the extent framings never set
it. An area framing that honoured a floor would refuse to show the area.

**The entity framing scale is named in `types.ts`.** `ENTITY_FOCUS_ZOOM = 16`, beside `SECTOR_ZOOM`,
`BLOCK_ZOOM` and `BLOCK_LABEL_ZOOM`. It is now a documented floor rather than a literal target, and a
route file is the wrong home for it. The value does not change, so no framing moves except by
refusing to zoom out.

## Risks / Trade-offs

- A reader at a very close scale who selects a distant marker arrives there at that scale, with little
  around them to recognise. Accepted as a non-goal in the proposal, and it is what asking to be located
  already does. Worth watching while driving the change rather than pre-empting with a cap.
- `minZoom` and `zoom` set together would be ambiguous. Mitigation: `minZoom` wins for a point, stated
  where the type is declared, and no producer sets both.
- A future producer of a point framing gets an exact scale by default and may want a floor without
  noticing. Mitigation: that is the safe direction, since an exact scale is what the type already
  meant.

## Known limitation, from review

**The floor is measured against the live scale, which interpolates during one of this module's own
zoom-changing moves.** A reader at scale 19 who opens an area (the extent fit animates 19 down to 11)
and taps a block about 100ms in is floored against the interpolated scale, so the block is framed a
half step closer than the floor asks for. The result is still the block, framed clear of the sheet,
which is why this is recorded rather than fixed.

Only a move that lowers the scale interpolates through values below the floor. A reader tapping from
marker to marker above the floor is served by an animation that changes no scale at all, so the live
read is correct there. An animation that zooms in toward the floor is harmless for the same reason
`Math.max` is a floor, since every value it passes through is below the target. What is left is the
moves that zoom out: an extent or content fit, a zoom-out button press, and an exact-scale animation,
which is the history restore and the pickers.

Not fixed, because the obvious fix is wrong and the correct one is a separate change. Skipping the live
read while this module is moving would pull that marker-to-marker reader back to the floor, which is
the case the change exists for. A correct fix measures against the scale the in-flight move is heading
to, which nothing records: it is known for every animation and for a point fit, and unknown for an
extent or content fit, whose settled scale only OpenLayers computes. That is new state in the camera,
threaded through six move sites.

The zoom buttons reach the same interpolation without any floor involved, because they animate the
scale and deliberately do not count as a framing, so a fix belongs to the module rather than to this
change.

## Open Questions

None.
