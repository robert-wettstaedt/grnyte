# Spec Delta

## Purpose

Defines what is allowed to move the explore map's camera and when, so that the framing a reader
asked for is the framing they keep, and so a reader can always recover the framing of the entity
whose detail they are reading.

## ADDED Requirements

### Requirement: One intention owns the camera

At any moment exactly one intention SHALL own the map camera. The intentions are the reader's own
location, one named entity, and the reader's own hand.

Anything that would move the camera SHALL move it only while it owns the camera, and SHALL leave it
untouched otherwise. The app SHALL NOT arbitrate between two things that both consider themselves
entitled to move the camera, because the reader cannot express two framings at once and every
attempt to serve both produces a camera that moves without being asked.

#### Scenario: A mover that does not own the camera stays quiet

- **WHEN** the camera is owned by an open entity and the reader's location updates
- **THEN** the camera SHALL NOT move, and the reader's position SHALL still be shown on the map

#### Scenario: A mover that owns the camera acts

- **WHEN** the camera is owned by the reader's location and their location updates
- **THEN** the camera SHALL move to keep their position in view

### Requirement: Only a deliberate act transfers ownership

Ownership SHALL transfer only in response to something the reader did: opening an entity's detail,
selecting its marker on the map, asking for the open entity to be shown, asking to be located,
moving the map by hand, or returning to an earlier history entry.

Data arriving SHALL NOT transfer ownership. This includes a location fix arriving, an entity's
record arriving, and any part of the guidebook syncing.

#### Scenario: A location fix does not claim the camera

- **WHEN** the reader has not asked to be located and their first location fix arrives
- **THEN** ownership SHALL NOT change, and the camera SHALL NOT move

#### Scenario: Selecting a marker claims the camera for that entity

- **WHEN** the reader selects a block's marker while the camera is owned by their location
- **THEN** ownership SHALL transfer to that block, and subsequent location fixes SHALL NOT move the
  camera

### Requirement: A late arrival never overrides the reader's choice

Where the thing a mover needs arrives after the reader has chosen a different framing, that mover
SHALL NOT apply its framing. This SHALL hold in both directions and regardless of how long the
arrival took.

This is the requirement that matters most on a poor connection, because the slower the arrival the
more settled the framing it would otherwise replace.

#### Scenario: A slow location fix does not take over from an open entity

- **WHEN** the reader opens an entity's detail and a location fix arrives seconds later
- **THEN** the camera SHALL remain on the entity

#### Scenario: A slow entity record does not take over from a reader who moved the map

- **WHEN** the reader opens an entity's detail, moves the map by hand while the record is still
  loading, and the record then arrives
- **THEN** the camera SHALL remain where the reader left it

#### Scenario: A slow entity record still frames the entity when nothing else was chosen

- **WHEN** the reader opens an entity's detail and does nothing while the record loads
- **THEN** the camera SHALL frame the entity once the record arrives

### Requirement: Moving the map by hand releases the camera to the reader, changing scale does not

Moving the map by hand SHALL transfer ownership to the reader, whatever the means: dragging,
a two finger gesture that moves the view, or the keyboard.

Changing only the scale SHALL NOT transfer ownership. A reader who is being followed and zooms in is
asking to see themselves more closely, not asking to stop being followed.

#### Scenario: A drag stops the camera following the reader

- **WHEN** the camera is owned by the reader's location and the reader drags the map
- **THEN** ownership SHALL transfer to the reader, and later location fixes SHALL NOT move the camera

#### Scenario: Zooming keeps the camera following the reader

- **WHEN** the camera is owned by the reader's location and the reader zooms using the map's zoom
  controls
- **THEN** ownership SHALL remain with the reader's location, and the next fix SHALL keep their
  position in view at the new scale

#### Scenario: A keyboard pan stops the camera following the reader

- **WHEN** the camera is owned by the reader's location and the reader pans using the keyboard
- **THEN** ownership SHALL transfer to the reader

### Requirement: The reader can always recover the open entity's framing

Wherever an entity's detail is open and that entity has a location, the app SHALL offer a way to
give the camera back to that entity. Using it SHALL transfer ownership to the entity and frame it,
and SHALL do so even when the entity was already the last thing framed.

That affordance SHALL NOT be offered for an entity with no location, because there is nothing to
frame.

The reader SHALL NOT have to dismiss or move the detail they are reading in order to reach it.

#### Scenario: Recovering a framing the reader's location took over

- **WHEN** the camera has moved to the reader's location while a block's detail is open, and the
  reader asks for the block to be shown
- **THEN** ownership SHALL transfer to the block, the camera SHALL frame the block, and the detail
  SHALL remain open

#### Scenario: Recovering a framing the reader panned away from

- **WHEN** the reader has moved the map by hand away from the open entity and then asks for it to be
  shown
- **THEN** the camera SHALL frame the entity again

#### Scenario: An entity with no location offers nothing to recover

- **WHEN** the detail of an entity that has no location is open
- **THEN** no affordance to show it on the map SHALL be offered

### Requirement: A framed entity lands where the reader can see it

Where part of the map is covered by the detail surface, an entity being framed SHALL land in the
part of the map the reader can actually see, and SHALL do so for however much of the map is covered
at the moment it is framed rather than for an assumed amount.

Changing how much of the map is covered SHALL NOT itself move the camera. The reader adjusting the
detail surface is not a request to reframe.

#### Scenario: Framing with the detail surface covering most of the map

- **WHEN** an entity is framed while the detail surface covers most of the map
- **THEN** the entity SHALL be visible in the uncovered part

#### Scenario: Framing with the detail surface barely covering the map

- **WHEN** the reader has reduced the detail surface to its smallest height and an entity is framed
- **THEN** the entity SHALL be visible, and SHALL NOT be pushed into a narrow strip as though the
  surface were still at its largest

#### Scenario: Adjusting the detail surface does not move the camera

- **WHEN** the reader drags the detail surface taller or shorter
- **THEN** the camera SHALL NOT move

### Requirement: Asking to be located arrives at a scale that shows something

Asking to be located SHALL bring the reader's position into view at a scale at which nearby blocks
are shown. It SHALL NOT leave the reader looking at their position on a view so wide that nothing
around them is identifiable.

It SHALL NOT reduce the scale. A reader already looking closely SHALL keep that closeness.

#### Scenario: Locating from a wide view moves in

- **WHEN** the reader asks to be located while looking at a view wider than the scale at which
  blocks are shown
- **THEN** the camera SHALL move to their position and the scale SHALL increase to at least the scale
  at which blocks are shown

#### Scenario: Locating from a close view keeps the scale

- **WHEN** the reader asks to be located while already looking closely
- **THEN** the camera SHALL move to their position and the scale SHALL NOT change

### Requirement: An unclaimed camera frames the guidebook content

On first showing the map with no entity open and nothing else owning the camera, the camera SHALL
frame the blocks available to the reader once there are any.

Once anything owns the camera that framing SHALL NOT happen, including later in the same session.
Closing an entity's detail SHALL NOT cause the map to reframe the whole region.

A surface whose view is driven by an explicit framing of its own, such as a location picker or a
static preview, is NOT an unclaimed camera, and this framing SHALL NOT run there at all.

A claim that has not yet moved the camera SHALL NOT prevent this framing, because an entity may turn
out to have no location, or never arrive, and the reader's location may never resolve. Painting the
content in the meantime SHALL NOT take the camera, so whichever of them eventually frames still can.

#### Scenario: A picker keeps the framing it was given

- **WHEN** a screen shows a map framed on one coordinate for the reader to adjust, and the
  guidebook's other locations arrive afterwards
- **THEN** the camera SHALL stay on that coordinate

#### Scenario: An entity with nothing to frame still shows the content

- **WHEN** the reader opens the detail of an entity whose record arrives with no location
- **THEN** the camera SHALL fall back to framing the content rather than staying where it was before
  anything had loaded

#### Scenario: First arrival frames the content

- **WHEN** the reader opens the map with no entity open and the blocks become available
- **THEN** the camera SHALL frame those blocks

#### Scenario: Closing a detail does not reframe everything

- **WHEN** the reader closes an entity's detail
- **THEN** the camera SHALL stay where it is

#### Scenario: More content arriving does not reframe

- **WHEN** further blocks become available after the camera has been framed
- **THEN** the camera SHALL NOT reframe

### Requirement: Returning to an earlier history entry restores its camera

Returning to a history entry the reader had moved the camera on SHALL restore the camera that entry
had when they left it, and SHALL transfer ownership to the reader, because a remembered camera is a
framing they established themselves rather than one belonging to an entity or to their location.

This applies to an entry that has no framing of its own. Where the entry being returned to is an
entity's own screen, that entity's framing SHALL win over the remembered camera: a reader going back
to a thing expects to see the thing, and the entity is the more specific answer to where to point.

#### Scenario: Going back restores the camera

- **WHEN** the reader moves the camera on a screen with no entity of its own, navigates forward, and
  then goes back to it
- **THEN** the camera SHALL be restored to where they left it on that entry

#### Scenario: Going back to an entity frames the entity

- **WHEN** the reader moves the camera while an entity's detail is open, navigates forward, and then
  goes back to that entity
- **THEN** the camera SHALL frame the entity rather than restoring the moved camera

#### Scenario: A restored camera is not then taken over

- **WHEN** a camera is restored by going back and a location fix arrives afterwards
- **THEN** the camera SHALL NOT move
