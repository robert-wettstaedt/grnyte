# Spec Delta

## RENAMED Requirements

- FROM: `### Requirement: Asking to be located arrives at a scale that shows something`
- TO: `### Requirement: Framing a point never reduces the scale`

## MODIFIED Requirements

### Requirement: Framing a point never reduces the scale

Framing a single location SHALL bring that location into view at a scale at which nearby blocks are
shown. It SHALL NOT leave the reader looking at a view so wide that nothing around the location is
identifiable.

It SHALL NOT reduce the scale. A reader already looking more closely than that SHALL keep the scale
they had, and SHALL keep it however much closer it is. This SHALL hold for every framing of a single
location, whoever asked for it: asking to be located, selecting a block or parking marker, opening
their detail, and asking for the open entity to be shown on the map.

A framing that restores a scale the reader established themselves is not covered by this and SHALL
land on that exact scale, because the scale is part of what is being restored. This covers returning
to an earlier history entry, and a surface whose view is driven by an explicit framing of its own such
as a location picker or a static preview.

Framing an area SHALL keep setting its scale from the extent of what it contains, because a scale
floor there would refuse to show the area.

#### Scenario: Locating from a wide view moves in

- **WHEN** the reader asks to be located while looking at a view wider than the scale at which blocks
  are shown
- **THEN** the camera SHALL move to their position and the scale SHALL increase to at least the scale
  at which blocks are shown

#### Scenario: Locating from a close view keeps the scale

- **WHEN** the reader asks to be located while already looking closely
- **THEN** the camera SHALL move to their position and the scale SHALL NOT change

#### Scenario: Selecting a marker from a close view keeps the scale

- **WHEN** the reader is looking more closely than the scale a block is framed at and selects another
  block's marker
- **THEN** the camera SHALL move to that block and the scale SHALL NOT change

#### Scenario: Selecting a marker from a wide view moves in

- **WHEN** the reader is looking at a view wider than the scale a block is framed at and selects a
  block's marker
- **THEN** the camera SHALL move to that block and the scale SHALL increase to the scale a block is
  framed at

#### Scenario: Showing the open entity keeps a closer scale

- **WHEN** the reader has moved the map by hand while looking closely, and asks for the open entity to
  be shown
- **THEN** the camera SHALL frame the entity and the scale SHALL NOT change

#### Scenario: A remembered scale is restored exactly

- **WHEN** the reader returns to a history entry whose remembered camera is wider than the view they
  are looking at now
- **THEN** the camera SHALL be restored to the remembered scale, including reducing the scale to reach
  it

#### Scenario: Framing an area still shows the whole area

- **WHEN** the reader opens an area whose blocks span more than the view they are looking at
- **THEN** the camera SHALL show all of those blocks, reducing the scale as far as that needs
