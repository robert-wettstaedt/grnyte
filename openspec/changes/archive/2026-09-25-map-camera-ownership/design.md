# Design

## Context

See proposal.md for motivation. The constraints that shape the approach:

- `Map.svelte` holds the only writable OpenLayers view on the explore map (built through
  `createBaseMap`, which `ReorderMap.svelte` is the other client of). Two effects in it move the
  camera: a one shot fit of all blocks, and one that applies the `focus` prop.
- `setupGeolocation` (`src/lib/map/geolocation.ts`), wired from `Map.svelte`'s attachment, is a third
  writer. It re-centres on every fix while follow mode is on.
- The `(map)` layout computes `focus` as `focus ?? createFocus ?? restoredFocus` and hands Map one
  value. The detail framing inside it reads synced rows, so it is `null` until those rows are local.
- The existing coordination is `getHasFocus: () => props.focus != null`, read once when a permission
  promise resolves. Because `focus` is derived from synced data, that read can land before the row
  does, which is the race the proposal describes.
- The focus effect already dedupes on `JSON.stringify(focus)`. That dedupe conflates two different
  things: which entity is being framed, and what the framing numbers are.
- Reads on this surface are Zero queries through the entity modules (`explore.blocks`,
  `explore.parkingLocations`). This change introduces no writes at all: no remote function, no
  mutation, no schema change and therefore no backfill.

## Goals / Non-Goals

**Goals:**

- One place decides who may move the camera, and it is unit testable outside a component.
- Ownership is claimed from information that is available instantly, so there is no window in which
  a mover can claim the camera because data has not arrived yet.
- The reader can hand the camera back to the open entity without dismissing or moving the sheet.

**Non-Goals:**

- Moving the map's floating controls so they stay clear of the sheet. See proposal.md Non-goals.
- Any change to `createBaseMap`, the shared view options, or `ReorderMap.svelte`, which has its own
  independent fit and its own `userMoved` latch and is not part of this capability.
- Replacing the `focus` prop with a different Map API. It is extended, not redesigned.

## Decisions

### Ownership is claimed from the route, not from the data

The single decision the rest depends on. The focus value gains an **owner key** that is derived from
the route (for example `blocks/123`), separately from the framing numbers it carries. The route
parameter is local and instant; the row is not.

That lets the two events be told apart, which today's `JSON.stringify` dedupe cannot do:

- the owner key changing means the reader deliberately opened something, so the entity **claims** the
  camera, even though its framing is not yet computable
- the owner key staying the same while the framing materialises means data arrived, so the framing is
  applied **only if that entity still owns the camera**

A deep link therefore claims the camera at mount, before any row syncs, so the permission driven
arming later finds the camera already owned and does not take it. The race is removed structurally
rather than by re-checking a flag, which is what makes it worth restructuring instead of patching.

Alternative considered: keep inferring ownership from `focus != null` and re-check it whenever focus
changes. Rejected because it cannot express "this entity owns the camera but I cannot draw it yet",
which is precisely the state a slow connection spends most of its time in.

### The transition table lives in a plain `.ts`, not in the component

The reducer is a pure function, `nextOwner(current, event)`, in a new `src/lib/map/cameraOwner.ts`,
with `Map.svelte` holding only the `$state` and calling it. Two reasons beyond ordinary testability:
AGENTS.md records that Stryker never matches `*.svelte`, so a transition table left in a component
cannot be mutation tested at all; and the table is the whole contract of this change, so it is the
one thing that should be pinned directly rather than through a component harness.

### Re-framing is a fresh claim, expressed as a nonce on the owner key

The Show action has to move the camera back to an entity that is already the owner key's subject, so
a value identical to the one already applied has to count as a new claim. Rather than adding a second
code path that bypasses the dedupe, the action bumps a counter that the layout folds into the owner
key (`blocks/123#2`). A bumped nonce is a changed owner key, so it flows through the same claim path
as opening the entity in the first place.

The request travels sheet to layout the way `sheetState.requestSnap` already does
(`Modal/sheetState.svelte.ts`), which is the established channel for a sheet originated request and
avoids threading a callback through three components.

### The sheet padding is read untracked

The framing padding moves from `window.innerHeight * 0.75` to the live `sheetState.sheetTop` that
`Modal.mobile.svelte` already publishes and the floating sibling nav pill already consumes. It is
read inside `untrack()` so it is **sampled** when the effect runs for another reason rather than
being a trigger of its own. Tracked, every frame of a sheet drag would produce a new framing and the
camera would crawl while the reader dragged, which is a worse bug than the stale padding it fixes.

### The primary action becomes a square by leaving the `cta` slot, not by changing the ActionBar API

On block and area, the primary action stops using `ActionBar`'s `cta` snippet and renders as the
first child of the tools row with `ACTION_TOOL` plus its primary preset. `ActionBar` itself changes
only its tools gap. Parking keeps the `cta` slot and its label, which `ParkingActions.svelte` states
is the only thing a parking pin is for.

The gap tightening from `gap-1.5` to `gap-1` buys margin; it does not avert an overflow. Measured on
the widest story at a 328px content box, the six square row needs 317px at `gap-1`, 327px at
`gap-1.5` and 337px at `gap-2`. So `gap-1.5` clears the row by a single pixel and `gap-2` is what
actually overflows. Chrome and Firefox agree on those figures.

An earlier version of this document claimed `gap-1.5` overflowed by 4 to 6px. That was wrong, and the
way it was wrong is worth keeping: the number came from injecting a cloned square into the running
app as a stand-in for the not-yet-built one, so it measured the mock-up rather than the row. Since
the tools are `shrink-0` and the row does not wrap, the failure mode is a control sliding off the
edge and becoming unreachable, and one pixel is not a margin against that.

There is no automated guard for this and there cannot be one here: the browser test project is jsdom,
which performs no layout, so every width it reports is zero. The `Narrow, widest` stories are a
visual reference to measure against by hand, not a check that fails on its own. They also have to set
`sheetState.canShowOnMap` themselves, because the Show square is gated on layout state Storybook
never mounts and the rows otherwise render one square short.

**Measure those stories in story view, not on the autodocs page.** Measured, the docs page renders no
Show square on any story while story view renders six. The cause is that a story's `play` does not
run in autodocs, NOT that the shared signal cannot hold a per-story value: the parking file sets the
same signal at module scope and its docs page renders the square on every row, which is the
discriminator. Deferred deliberately, because the failure is catalogue fidelity rather than app
behaviour; a `play` that does not run is also why a decorator is the first thing to try if it is ever
picked up, ahead of anything that gives the button an input, which the Risks entry above rejects.

Alternative considered: `flex-wrap` as a safety net. Rejected by the user on the grounds that one
button alone on a second row is worse than the overflow it guards against.

### Existing precedents each piece extends

Named before proposing anything new, per the project rules:

| Piece                                                   | Extends                                                                                    |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Keyboard pan cancels follow                             | `ReorderMap.svelte`'s `PAN_KEYS` keydown latch, the same pattern for the same purpose      |
| Locate zoom floor                                       | the quick-create framing in the `(map)` layout, already `Math.max(zoom, BLOCK_LABEL_ZOOM)` |
| Show action, hidden without coordinates                 | `DirectionsButton`, which self-hides on a null destination                                 |
| Show action's short caption plus fuller accessible name | `SaveButton`, which pairs a short visible label with a longer aria-label                   |
| Sheet originated request                                | `sheetState.requestSnap`                                                                   |
| Live sheet top edge                                     | `sheetState.sheetTop`, already measured and published                                      |
| Owner key nonce                                         | no precedent; new, and the only genuinely new mechanism here                               |

### The copy keys move rather than being duplicated

`routes_showOnMap` is the existing phrase and is correct, but its `routes_` prefix is wrong for an
action that appears on blocks, areas and parking. It is renamed to `map_showOnMap` and its two
`RouteRow` call sites updated, and a short `map_show` is added for the visible caption. This keeps one
prefix per domain as AGENTS.md requires instead of leaving a near duplicate string under two prefixes.
A paraglide key rename is build time only and carries no deploy risk.

### The picker's device seed is gated on a gesture flag, never on `pannedCenter`

Making the map focusable turns on two OpenLayers behaviours the picker did not account for, and both
were found in review rather than by driving.

`pannedCenter` cannot stand in for "the reader moved the pin". OpenLayers dispatches `moveend` on its
own second render frame with no gesture at all, so it is set roughly a frame after mount, long before
`navigator.permissions.query` resolves or `watchPosition` returns a fix. Gating the device seed on it
made the seed unreachable on exactly the cold start it exists for; it only appeared to work because
the shared `userLocation` singleton already held a fix from an earlier screen. Driven both ways at
`/areas/8/parking/edit` on a full page load with geolocation emulated at Munich: with the gesture flag
the readout is 48.13720N, 11.57560E; with `pannedCenter` restored it is the region default
46.49265N, 8.69857E. The picker now keeps its own `touched` flag alongside the parent's, set by the
same gestures.

`tabIndex = 0` also enables OpenLayers' `KeyboardPan`, which emits no pointer event, so arrow keys
moved the pin without marking the form dirty and the leave confirm never fired. Driven: arrow-right
moves the centre 11.57560 to 11.58109, and Cancel then raises "Leave without saving your changes?";
with the `keydown` listener removed the same pan leaves silently.

### The content fit is off on any picking or preview surface, by `pickMode`, not by `focus`

Spec: "A surface whose view is driven by an explicit framing of its own ... this framing SHALL NOT run
there at all." The guard implemented that as `focus != null`, which is a different statement. An area
with no located block leaves the picker's `focus` null while `mapData.blocks` still holds the whole
region, so the fit had material and ran. Driven at `/areas/8/parking/edit` (region 2, 90 located
blocks) with `watchPosition` stubbed out so the fit is the only mover: with `focus != null` the pin
lands on the region fit at 46.49265N, 8.69857E; with `pickMode || static` it lands on the Fontainebleau
default, 48.41039N, 2.61176E. So this was also silently overriding the agreed no-permission default.

`pickMode` rather than a new prop is deliberate: `/explore` sets it only while the reader is placing a
pin, and suppressing an automatic reframe under a pin somebody is placing is the same requirement.

### The picker holds an aimed view across its own remount

Toggling to Coordinates and back remounts the map with a fresh `lastFocusKey`, so `placeFocus` was
re-applied and the pin snapped back to the seed. Once `touched`, the panned centre and zoom outrank
every framing below it. Driven: pan to 48.14087N, 11.58109E, toggle out and back, position holds;
with the branch removed the same toggle reverts to the seed at 48.13720N, 11.57560E.

### The picker asks the map what the reader did, instead of listing OpenLayers gestures

Four separate defects were one shape: the picker enumerated the gestures that move a pin whose
position IS the map centre, and the enumeration kept falling behind OpenLayers. Wheel, then arrow
keys, then double-click zoom, then the locate control, which is a button and no gesture list would
ever have caught.

`Map` now exposes `onreadermove`, fired from `claimForReader` (before its early return, since a
caller tracking edits needs every gesture, not just the first) and from the locate press. The picker
passes `onreadermove={edited}` and its whole listener attachment is gone: no DRAG_SLOP, no key set,
no wheel or dblclick handlers. One place decides what "the reader moved the camera" means, and it is
the place that already had to know.

This is not the deferred "did the camera move" refactor, which would key off `moveend` and needs a
latch across the frame boundary because `moveend` dispatches from postrender, by which time
`framing` is back to 0. That remains its own change.

Driven: locate press then Cancel raises the leave confirm, and with only the locate hook removed the
identical press and Cancel leave silently. Arrow keys still mark, Shift+Arrow and Cmd+Arrow still do
not, and the mode toggle still restores a panned view.

### The restore view is a snapshot, not the live view

Feeding the live centre back in as `focus` makes the map its own input, terminating only on a
byte-identical dedupe key across a lonLat round trip that is not bit-exact. Measured with a moveend
counter: after a pan the count stopped growing within 4s on both versions, so the loop did not fire
for these coordinates and the dedupe held. The snapshot is kept anyway because it removes the
possibility rather than depending on rounding, and a silent endless animate would also stop
`pendingZoomFloor` from ever clearing.

### Driving anything location-dependent in this environment

Chrome DevTools' geolocation override pushes a position to watchers only when the override is SET or
CHANGED. A `watchPosition` started afterwards gets `POSITION_UNAVAILABLE` and then nothing, so a page
opened after the override was applied shows no distance anywhere and the shared watcher stays empty.
Re-applying the override delivers to every live watcher at once. Five stagings failed on this before
it was found, and it was misread first as a dead feature and then as `document.hidden`.

It also means the stale-fix case cannot occur under plain emulation at all: a new watcher always gets
the current position promptly, so the window where the singleton holds an old fix and the fresh one is
still pending never opens. Reproducing it needs `watchPosition` wrapped to delay delivery, which is
not a trick but a model of the condition the reader described: GPS at a crag takes seconds.

Driven that way, end to end: parking detail with the override re-applied so the distance renders
(301 km, proving the singleton holds the fix), navigate away so the watcher is torn down, move the
device, open the picker. With the identity guard the pin sits at the Fontainebleau default while the
fix is pending; without it the pin lands on the stale fix at 48.13721N, 11.57561E.

### A sound instrument aimed one level off, four times in this change

Worth recording as a pattern rather than four incidents: a `KeyboardEvent` dispatched at the element
it was attached to; a gap measured on an injected clone rather than the real row; and a probe testing
`className.includes('preset-filled')`, which is true in all three branches of that button and so read
"following" in every state. All returned green. The third was caught only by disbelieving a result
that disagreed with the code.

The fourth is in a TEST rather than a probe, which makes it the worst of them. A camera test asserted
"the fit above already completed" in the same tick, which OpenLayers does not do: every fit and
animate callback goes through `animationCallback`, a `setTimeout(fn, 0)` (View.js:1923), so none of
them is ever synchronous. The test passed for two rounds while encoding a false timing premise, and
two reviews cleared the `framing` counter on the strength of those same callbacks being invoked,
citing View.js:733/854/1470 without noticing all three defer. The count balanced for a different
reason entirely: a second, synchronous release that has since been removed.

A probe reading the wrong element is visible once you look at it. A test encoding a wrong timing
premise looks exactly like a correct test, and it makes every later review of that area weaker,
because it is cited as evidence. When a test asserts WHEN something happens, check the timing against
the library's source, not against what the API looks like it should do.

### The map controls ride above the sheet, up to the half open snap

The other half of the reported dead end: at the default snap the zoom, locate and layers controls are
covered, so a reader whose camera had been taken could not even reach the controls to fix it. The
column now takes a `controlsLift` in pixels and the `(map)` layout computes it from
`sheetState.sheetTop`, capped at half the app frame because above that the sheet is the screen and
there is no map worth reaching.

Tracked, deliberately unlike the camera padding a few lines above it, which is sampled: the controls
must follow the finger, where a camera doing the same would crawl along under it.

Driven at 375x667 with real touch events: the column follows a drag frame by frame, 8px above the
sheet edge throughout (sheet 187 to 327, lift 195 to 335), and past the half open point it pins at
342 while the sheet keeps growing to 559. Desktop is untouched, with no inline offset at all.

This was originally written up as a Non-goal on the grounds that tracking the sheet reaches across
every sheet route. That was wrong: `sheetState.sheetTop` already existed, already updated live, and
the sibling-nav pill already rode it the same way.

## Risks / Trade-offs

- **`BlockForm.svelte` has the same stale-singleton shape and is NOT fixed here.** `userLocation()`'s
  `current` ignores its own `enabled` gate, so "Use current location" can commit a fix recorded on an
  earlier screen. Out of scope: this change is the picker default. The analysis is recorded so it is
  not rediscovered from scratch.
- **Someone later derives the owner key from synced data rather than the route** → the race returns
  and nothing fails visibly. **This is not pinned by a test and cannot be here.** The behaviour lives
  in `Map.svelte`'s claim effect and the layout's claim derivation, both components, and the browser
  test project is jsdom, which neither mounts them meaningfully nor performs layout. `cameraOwner.ts`
  and `claimKey` are unit tested, but they are the parts that were never wrong. The only instrument
  that reaches the defect is driving the app, so it is written down here rather than left to look
  covered: open an entity, navigate to a screen that claims nothing, pan, reopen the same entity, and
  the camera must return to it.
- **Someone later gives `ShowOnMapButton` a prop to force it visible** → a caller can then assert
  "framable" when the map cannot frame anything, which is the class of bug moving this decision to
  the layout removed. The pull towards it is real, because the Storybook catalogue cannot mount the
  layout and so looks incomplete; the stories set `sheetState.canShowOnMap` per story instead. A
  missing catalogue entry is visible in the catalogue, while a component input that contradicts what
  it describes is only visible when someone presses a square that does nothing.
- **Someone later makes the padding read tracked** → the camera crawls while the sheet is dragged.
  Pinned by the scenario asserting a sheet drag moves nothing, and worth a one line comment at the
  `untrack` rather than a long explanation.
- **A third locale overflows the action row again** → the German margin at 360px is 4px, and the repo
  has a `machine-translate` pipeline that can introduce a longer locale without anyone measuring.
  Recorded as a condition on the row rather than mitigated, since reducing touch targets to buy
  headroom was rejected.
- **Browser or OS font scaling overflows the row** → already true of today's four tool row, so this
  change does not introduce it, but it does move closer to the edge.
- **The camera has no test coverage today and no e2e spec drives the map** → the reducer is unit
  testable, but the wiring between it and the OpenLayers view is not covered by anything existing, so
  the behaviour has to be driven in the running app at both viewports to be believed.
- **Ownership is component state, so a genuine remount loses it** → acceptable, and matches what
  `savedView` already does by reseeding the view from the last position rather than refitting.

## Migration Plan

No schema, no URL, no remote function export and no `manifest.id` change, so there is nothing to
migrate and no cutover step. Already loaded tabs keep the old camera behaviour until they reload,
and every endpoint they can call is unmoved.

Rollback is a revert: nothing outside the client changes, and no data is written in a shape a
previous version could not read.
