## ADDED Requirements

### Requirement: A grade-range filter needs no route rows on the map

While the only active filter is a grade range, the map SHALL narrow its markers and counts from the block summaries,
counting only the routes whose community grade lies in the range, and SHALL NOT need the region's routes on the
device to do so. Any other filter SHALL narrow the map from the routes matching it, as before.

#### Scenario: Filtering to a grade range

- **WHEN** the reader filters the explore map to 6A to 6C with no other filter, on a device that does not keep the
  guidebook for offline use
- **THEN** the map SHALL draw only blocks with a route in that range, each counting only those routes, and no route
  rows SHALL be requested for the map

#### Scenario: A tag filter

- **WHEN** the reader adds a tag filter
- **THEN** the map SHALL narrow by the routes matching both, as before

### Requirement: "Not sent yet" needs no route rows on the map

While the "not sent yet" filter is active, alone or with a grade range, the map SHALL narrow to blocks holding a live
route the reader has not sent, across every live route of the region, without the region's routes on the device.

#### Scenario: Not sent yet in a large region

- **WHEN** the reader is online and filters the map to routes they have not sent, on a device that does not keep the
  guidebook for offline use
- **THEN** the map SHALL draw every block holding such a route, with its count, without syncing the region's routes

## MODIFIED Requirements

### Requirement: A block's detail reports which routes match

While a filter is active, a block's detail SHALL still list every route of the block in its usual
order, SHALL state in text how many of them match the filter out of how many there are, and SHALL
visually de-emphasise the routes that do not match. With no filter it SHALL be unchanged. Whether a route matches
SHALL be judged from the route itself, so the report SHALL be correct when the map narrowed from the block
summaries.

#### Scenario: Some routes match

- **WHEN** a filter is active and two of a block's six routes match it
- **THEN** the detail SHALL list all six, SHALL say two of six match, and SHALL de-emphasise the
  other four

#### Scenario: No filter

- **WHEN** no filter is active
- **THEN** the detail SHALL show its usual route count and no route SHALL be de-emphasised

#### Scenario: Only a grade range

- **WHEN** only a grade-range filter is active and two of a block's six routes lie in it
- **THEN** the detail SHALL say two of six match and SHALL de-emphasise the other four

### Requirement: An area's detail reports which routes match

While a filter is active, an area's detail SHALL state its matching route count out of its total,
SHALL state each listed block's matching count out of its total, and SHALL draw its grade chart with
the matching routes distinguishable from the full profile, which SHALL stay visible. Whether a route matches SHALL
be judged from the route itself, so the report SHALL be correct when the map narrowed from the block summaries.

#### Scenario: Counts and chart under a filter

- **WHEN** a filter is active and 12 of an area's 80 routes match it
- **THEN** the detail SHALL say 12 of 80, each block row SHALL give its own matching count out of
  its total, and the chart SHALL show the 12 over the faded 80

#### Scenario: Only a grade range

- **WHEN** only a grade-range filter is active and 12 of an area's 80 routes lie in it
- **THEN** the detail SHALL say 12 of 80 and the chart SHALL show the 12 over the faded 80
