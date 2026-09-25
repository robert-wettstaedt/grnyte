# Proposal

## Why

Two things move the explore map's camera independently: the reader's location while follow mode is
on, and the framing of whichever entity's detail sheet is open. Nothing arbitrates between them
except a single boolean sampled once, at whatever moment a permission promise happens to resolve.
The consequence on a slow connection at a crag is that whichever the reader chose gets overridden by
the other as soon as it finishes loading, and there is no way to ask for it back: the reader is left
with a detail sheet open and the entity it describes off screen.

This is reported from real device use, not inferred. The sharpest case needs no bad connection at
all: on `/explore`, press locate, then tap a block pin. The camera frames the block, then returns to
the reader's position a second later, because tapping a pin never turned follow mode off.

## What Changes

- The camera gains a single **owner**. Every mover claims ownership before it may write, and a mover
  that does not own the camera does not move it. The owner is one of: the reader's location, a named
  entity, or free (the reader moved it themselves).
- A location fix moves the camera only while location owns it. An entity's framing applies only
  while that entity owns it, which is what stops a late arriving row from overriding a reader who
  panned while it loaded.
- The one shot fit of all blocks on a fresh `/explore` runs only when nothing owns the camera yet.
  The `hasAutoFitted` latch is replaced by ownership, which also removes the case where that fit
  fires for the first time on closing a detail sheet and reframes the whole region.
- Arrow key pan cancels follow mode. It currently does not, because OpenLayers' `KeyboardPan` emits
  no `pointerdrag`. Every other gesture already behaves correctly and is left alone.
- A **Show** action on block, area and parking detail takes ownership back and reframes the entity.
  It is hidden when the entity has no coordinates, matching how Directions already behaves.
- The action row's one labelled action becomes a square on block and area so six actions fit, keeping
  its primary colour. Parking keeps its labelled Directions action, which its own source states is
  the only thing a parking pin is for. The tool row's gap tightens from `gap-1.5` to `gap-1` to buy
  margin: at the narrowest phone width a six square row clears `gap-1.5` by a single pixel, and the
  row cannot wrap, so anything that grows puts a control off screen rather than looking cramped.
- The framing padding that keeps a marker clear of the sheet reads the sheet's live top edge instead
  of assuming the sheet is at its default snap point. It is sampled when ownership changes, never as
  a reactive input, so dragging the sheet does not drag the camera with it.
- The locate control applies a zoom floor rather than leaving zoom untouched, so pressing it from a
  wide view arrives somewhere useful. It never zooms out.

No URL changes, no remote function renames or moves, and no change to `manifest.id`. Already loaded
tabs across the deploy keep working: they continue to run the old camera behaviour until they
reload, and nothing they can request has moved.

## Capabilities

### New Capabilities

- `map/camera-ownership`: What is allowed to move the explore map's camera and when. Covers which
  intention owns the camera, what transfers ownership, what a mover may do while it does not own the
  camera, how the reader recovers a framing that was taken from them, and how the camera accounts
  for the sheet covering part of the map.

### Modified Capabilities

None. `navigation/back-navigation` and `navigation/scroll-restoration` govern back destinations and
scroll position; the camera is a third kind of position that neither currently describes, and their
requirements are unchanged by this work. The one adjacency worth noting is that returning to a
history entry restores that entry's remembered camera, which this new capability owns rather than
scroll restoration.

## Non-goals

- **Revisiting which gestures cancel follow.** Measurement confirmed the existing behaviour already
  matches the intended rule that panning cancels and zooming does not. Only the keyboard pan gap is
  in scope.
- **Map rotation.** Disabled at the shared view for every map in the app, so nothing here rotates a
  camera or reads a rotation.
- **The route detail page.** It lives outside the `(map)` route group with no map mounted behind it,
  so a Show action there would be a navigation, which the route list row already provides.
- **Reducing touch targets.** The measured margin at 360px is positive with the gap change alone, so
  squares stay at 48px.

## Impact

**Routes and components**

- `src/lib/map/Map.svelte`: the two effects that move the camera, the locate and zoom handlers, and
  the `moveend` snapshot.
- `src/lib/map/geolocation.ts`: the follow mode writes, the permission driven arming, and the
  gesture that cancels follow.
- `src/lib/map/types.ts`: the focus shape the camera is commanded with.
- `src/routes/(app)/(shell)/(explore)/(map)/+layout.svelte`: where the framing for the open entity
  and the padding that clears the sheet are computed, and where a remembered camera is restored.
- `blocks/[id]/BlockActions.svelte`, `areas/[id]/AreaActions.svelte`,
  `parking/[id]/ParkingActions.svelte`: the new Show action.
- `src/lib/components/ActionBar/ActionBar.svelte`: the squared labelled action and the tighter gap.

**Entity modules**: none change shape. `entities/geolocation/` is read for the existing location
meta line but its behaviour is untouched.

**Tables and schema**: none. No column, no migration, no backfill, no RLS change.

**Copy**: one new key in both `messages/en.json` and `messages/de.json` for the action's short
label. The existing `routes_showOnMap` is reused for its accessible name rather than adding a near
duplicate.

**Tests**: the camera has no test coverage today and no e2e spec drives the map. The behaviour this
change introduces is the first thing about the camera worth pinning.
