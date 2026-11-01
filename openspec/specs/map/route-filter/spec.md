# route-filter Specification

## Purpose

Defines how the route filter the reader sets on the explore screens follows them onto detail
screens, how those screens report which routes match it without hiding the rest, and how the reader
clears it from a detail.

## Requirements

### Requirement: The route filter carries onto detail screens

The route filter last applied on the explore or search screen SHALL keep narrowing the map while a
detail screen is open, exactly as it narrows it on the explore screen, and SHALL still apply on
returning there. A detail opened by a fresh load with no filter applied before it SHALL be unfiltered.

#### Scenario: A block opened under a grade filter

- **WHEN** the reader filters the explore map to one grade and opens a block's detail
- **THEN** the map under the detail SHALL draw only blocks holding routes of that grade, plus the
  open block, and its counts SHALL count only those routes

#### Scenario: Closing the detail keeps the filter

- **WHEN** the reader closes that detail
- **THEN** the explore screen SHALL show the same filter applied

#### Scenario: A deep link opens unfiltered

- **WHEN** the reader loads a block's detail URL in a fresh tab
- **THEN** the map SHALL not be narrowed by any route filter

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

### Requirement: The area route list edits the shared filter

Changing the filter from the area route list SHALL change the same filter the explore screen
applies, so the map under it, the detail indicator and the explore screen reflect the change.

#### Scenario: Filtering from the area route list

- **WHEN** the reader sets a grade filter from an area's route list and then closes the detail
- **THEN** the explore screen SHALL show that grade filter applied

### Requirement: The detail indicator names an active filter

The detail screen indicator SHALL also be shown while only a filter is active, and SHALL name what
narrows the map: the search text, that filters are on, or both. Its clear control SHALL clear the
search text and the filter together, leaving the detail open.

#### Scenario: Only a filter

- **WHEN** a filter is active, there is no search text, and the reader opens a block's detail
- **THEN** the indicator SHALL be shown and SHALL say that filters are on

#### Scenario: Search and filter

- **WHEN** both are active on a detail screen
- **THEN** the indicator SHALL name the search text and say that filters are on

#### Scenario: Clearing both

- **WHEN** the reader presses the clear control and then closes the detail
- **THEN** the map SHALL draw every block while the detail is open, and the explore screen SHALL
  show no search text and no filter

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
