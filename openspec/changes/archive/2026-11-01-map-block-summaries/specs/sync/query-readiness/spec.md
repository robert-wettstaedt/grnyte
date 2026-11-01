## MODIFIED Requirements

### Requirement: Summary values follow the rows on hand

A count, tally, histogram, position within a set, or other value summarising a collection SHALL be
presented from the rows on hand while that collection is arriving, and SHALL settle in place to the
confirmed value. A summary of zero is a claim of absence and SHALL wait for confirmation. Offline, a
collection that is not answered SHALL NOT be summarised. The newest-first window of the activity feed
remains governed by its own exception.

#### Scenario: Area chart after a reload

- **WHEN** an area page opens after a reload and its routes are on the device but not yet confirmed
- **THEN** the grade chart and route count render from the routes on hand
- **AND** they update in place, without going blank, once the routes are confirmed

#### Scenario: Map markers while the blocks are unconfirmed

- **WHEN** no route filter is active, or only a grade range, and the map's blocks are still being
  confirmed after a reload or a first open
- **THEN** each area, sector and block marker shows the count and grade split from the summaries of
  the blocks on hand
- **AND** they settle to the confirmed values without the marker going blank

#### Scenario: Map markers while the routes are unconfirmed

- **WHEN** a route filter the block summaries cannot answer is active and its routes are still being
  confirmed
- **THEN** each area, sector and block marker shows the count and grade split of the matching routes
  on hand
- **AND** they settle to the confirmed values without the marker going blank

#### Scenario: Nothing on hand yet

- **WHEN** a collection is arriving and none of its rows are on the device
- **THEN** no count, chart or position is shown for it, and no zero is stated

#### Scenario: Position among siblings

- **WHEN** a block's sibling list is arriving
- **THEN** the position and the previous and next controls are drawn from the siblings on hand
- **AND** every control leads to a sibling that exists

#### Scenario: Offline fragment

- **WHEN** the device is offline and holds some rows of a collection that is not kept for offline use
- **THEN** no summary of that collection is shown
