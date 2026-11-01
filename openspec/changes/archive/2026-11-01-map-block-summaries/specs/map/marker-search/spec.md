## MODIFIED Requirements

### Requirement: Search narrows the markers to matching blocks

While the reader has search text, the map SHALL draw only blocks whose own name or description, an enclosing area's
name or description, or one of their routes' name or description contains that text, ignoring case: what the search
suggestions match. With no search text every block SHALL be drawn. The narrowing SHALL compose with an active route
filter. Online, routes SHALL be matched across every live route of the region, whether or not those routes are on the
device, and the narrowing SHALL follow the text once the reader pauses typing rather than on every keystroke. Offline,
routes SHALL be matched against the routes on the device, and blocks and areas as online.

#### Scenario: Searching a route name shows its block

- **WHEN** the reader types the name of a route whose block and areas do not contain that text
- **THEN** the map SHALL draw that route's block

#### Scenario: Searching a block name

- **WHEN** the reader types text contained in a block's name
- **THEN** the map SHALL draw that block and SHALL NOT draw blocks that match by nothing

#### Scenario: Searching a description

- **WHEN** the reader types text contained only in a block's, an area's or a route's description
- **THEN** the map SHALL draw that block, the area's blocks, or the route's block

#### Scenario: Search and a route filter compose

- **WHEN** the reader has search text and an active route filter on the explore screen
- **THEN** the map SHALL draw only blocks that match the text and hold a route the filter keeps

#### Scenario: A route not on the device

- **WHEN** the reader is online, no route of the region is on the device, and they type a route's name
- **THEN** the map SHALL draw that route's block once they pause typing

#### Scenario: Searching offline

- **WHEN** the reader is offline and types the name of a route that is on the device
- **THEN** the map SHALL draw that route's block
