# marker-search Specification

## Purpose

Defines how the text a reader types into the explore search narrows the map's markers, which entity
that narrowing may never hide, and how a reader on a detail screen can tell the map is narrowed and
undo it.

## Requirements

### Requirement: Search narrows the markers to matching blocks

While the reader has search text, the map SHALL draw only blocks whose own name, an enclosing area's
name, or one of their routes' names contains that text, ignoring case. With no search text every
block SHALL be drawn. The narrowing SHALL compose with an active route filter.

#### Scenario: Searching a route name shows its block

- **WHEN** the reader types the name of a route whose block and areas do not contain that text
- **THEN** the map SHALL draw that route's block

#### Scenario: Searching a block name

- **WHEN** the reader types text contained in a block's name
- **THEN** the map SHALL draw that block and SHALL NOT draw blocks that match by no name

#### Scenario: Search and a route filter compose

- **WHEN** the reader has search text and an active route filter on the explore screen
- **THEN** the map SHALL draw only blocks that match the text and hold a route the filter keeps

### Requirement: The open entity is never narrowed away

While a block's detail is open, that block SHALL be drawn and SHALL be framable, whatever the search
text or any other narrowing would exclude. While an area's detail is open, every block under that
area at any depth SHALL be drawn and framable in the same way. The exemption SHALL end when the
detail closes.

#### Scenario: A block reached from a route found by search

- **WHEN** the reader searches a route name, opens the route, and follows its breadcrumb to the block
- **THEN** the block SHALL be drawn, the camera SHALL frame it, and the affordance to show it on the
  map SHALL be offered

#### Scenario: An area whose blocks do not match

- **WHEN** search text is active and the reader opens an area none of whose blocks match it
- **THEN** every block under the area SHALL be drawn and the camera SHALL frame them

#### Scenario: The exemption ends with the detail

- **WHEN** the reader closes the detail of a block that does not match the active search text
- **THEN** that block SHALL no longer be drawn

### Requirement: Placing a new block or parking spot shows every block

While the reader is placing a new block or parking spot on the map, the search text SHALL NOT narrow
the markers, so every existing block is visible while choosing the spot. The narrowing SHALL resume
when placement ends, with the search text unchanged.

#### Scenario: Placing under an active search

- **WHEN** search text is active and the reader starts placing a new block
- **THEN** the map SHALL draw every block until placement ends

#### Scenario: The search survives placement

- **WHEN** the reader cancels the placement
- **THEN** the map SHALL again draw only the blocks matching the unchanged search text

### Requirement: A detail screen shows when search narrows the map

While a detail screen is open over the map and search text is active, the map SHALL show a quiet
indicator naming the search text. It SHALL NOT be shown with no search text, nor on the explore or
search screens, where the search bar itself is visible. Syncing status SHALL NOT replace it, but
the map reporting that it is still loading SHALL take its place until loading ends.

#### Scenario: Indicator on a detail screen

- **WHEN** the reader opens a block's detail while search text is active
- **THEN** the map SHALL show an indicator containing that text

#### Scenario: No indicator without a search

- **WHEN** the reader opens a block's detail with no search text
- **THEN** no indicator SHALL be shown

#### Scenario: The map still loading comes first

- **WHEN** search text is active, a block's detail is open, and the map has not finished loading
- **THEN** the map SHALL say it is loading, and the indicator SHALL appear once it has loaded

#### Scenario: Syncing does not hide it

- **WHEN** the indicator is shown and part of the guidebook starts syncing
- **THEN** the indicator SHALL remain shown

### Requirement: The indicator is visible and announced in context

The indicator SHALL NOT sit under the open detail at any viewport width, and SHALL be announced to
assistive technology as the map showing matches for the search text, not as the bare text.

#### Scenario: A desktop sheet at a narrow desktop width

- **WHEN** a block's detail is open beside the map at 800 CSS pixels wide with search text active
- **THEN** the indicator SHALL be fully visible over the map, not under the sheet

#### Scenario: Announced with its meaning

- **WHEN** the indicator appears for the search text "Egg"
- **THEN** assistive technology SHALL hear that the map shows matches for "Egg"

### Requirement: The reader can clear the search from a detail screen

The indicator SHALL carry one control, distinct from its label, that clears the search text. It
SHALL have an accessible name saying it clears the search and a touch target of at least 24 by 24
CSS pixels, and the indicator SHALL be no taller than the app's other pills. The label SHALL NOT act on a press. Clearing SHALL leave the detail open.

#### Scenario: Clearing restores every marker

- **WHEN** the reader presses the indicator's clear control
- **THEN** the search text SHALL be empty, the map SHALL draw every block, the indicator SHALL
  disappear, and the detail SHALL remain open

#### Scenario: The cleared search stays cleared

- **WHEN** the reader clears the search from a detail screen and then closes the detail
- **THEN** the explore screen SHALL show an empty search bar

#### Scenario: Pressing the label does nothing

- **WHEN** the reader presses the indicator's label
- **THEN** the search text, the map and the screen SHALL be unchanged
