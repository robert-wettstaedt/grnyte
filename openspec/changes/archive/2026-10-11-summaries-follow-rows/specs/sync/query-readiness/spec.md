# Spec Delta

## ADDED Requirements

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

#### Scenario: Map markers while the routes are unconfirmed

- **WHEN** the map's route list is still being confirmed after a reload or a first open
- **THEN** each area, sector and block marker shows the count and grade split of the routes on hand
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

### Requirement: Each surface shows one syncing indication

The screen, and each sheet, panel or dialog open over it, is a surface. While any collection a
surface shows is arriving, that surface SHALL show exactly one indication that more is expected, at
the top of the surface and centred over its content, announced as a status, until every such
collection is confirmed. Data the whole application holds, and search results, SHALL NOT keep it
shown.

#### Scenario: A profile with dependent lists

- **WHEN** a profile's logbook is confirmed and its project lists, which depend on it, are still
  arriving
- **THEN** the indication stays shown without interruption until the project lists are confirmed

#### Scenario: Fast confirmation

- **WHEN** every collection on a screen is confirmed within a quarter of a second
- **THEN** no syncing indication appears

#### Scenario: The unread count arriving

- **WHEN** a screen's own collections are confirmed and only the unread notification count is still
  arriving
- **THEN** no syncing indication is shown

#### Scenario: New activity while syncing

- **WHEN** the feed holds new activity to merge while a collection on the screen is still arriving
- **THEN** the indication offers the new activity in place of the syncing message
- **AND** it changes between the two in place rather than one leaving and another arriving

#### Scenario: A sheet syncing over the map

- **WHEN** an area sheet is open over the map and only the sheet's collections are arriving
- **THEN** the indication shows at the top of the sheet, not over the map
- **AND** an action it offers, such as merging new activity in an open activity log, can be used

#### Scenario: Searching

- **WHEN** the reader types in a search field and the results arrive
- **THEN** no syncing indication appears for them

#### Scenario: The map with nothing to draw yet

- **WHEN** the map has no rows on hand for a query it draws
- **THEN** the indication states that the map is loading rather than the generic syncing message

## MODIFIED Requirements

### Requirement: One query reads the same everywhere

Every screen showing the same synced query SHALL describe its state the same way: loading, arriving
(rows shown, more expected, connection up), answered, unavailable offline, or failed. No screen may
treat a query as still arriving while another treats it as answered, and no screen may show an
absence or a summary of zero for a query that is not answered.

#### Scenario: Two screens read one query mid-sync

- **WHEN** the same query feeds a page section and a sheet while its rows are still arriving
- **THEN** both show it as arriving: rows and their summaries where there are rows, and no "none"
  claim

#### Scenario: The connection drops after the answer

- **WHEN** a query has been answered and the socket then parks
- **THEN** every screen keeps showing it as answered, with its total

#### Scenario: A query that never answered goes offline

- **WHEN** the device goes offline before a query not kept for offline use was ever answered
- **THEN** every screen showing it says it is unavailable offline, never loading forever and never
  empty

## REMOVED Requirements

### Requirement: Derived totals require a confirmed query

**Reason**: After a reload every query is unconfirmed, so the rule blanked complete local data for
seconds. The fragment cases it guarded are covered by the absence requirement, the offline rules and
the feed's first-window exception.

**Migration**: Replaced by "Summary values follow the rows on hand", which keeps the zero and
offline cases withheld and folds in the map marker exception.
