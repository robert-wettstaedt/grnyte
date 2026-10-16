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
visually de-emphasise the routes that do not match. With no filter it SHALL be unchanged.

#### Scenario: Some routes match

- **WHEN** a filter is active and two of a block's six routes match it
- **THEN** the detail SHALL list all six, SHALL say two of six match, and SHALL de-emphasise the
  other four

#### Scenario: No filter

- **WHEN** no filter is active
- **THEN** the detail SHALL show its usual route count and no route SHALL be de-emphasised

### Requirement: An area's detail reports which routes match

While a filter is active, an area's detail SHALL state its matching route count out of its total,
SHALL state each listed block's matching count out of its total, and SHALL draw its grade chart with
the matching routes distinguishable from the full profile, which SHALL stay visible.

#### Scenario: Counts and chart under a filter

- **WHEN** a filter is active and 12 of an area's 80 routes match it
- **THEN** the detail SHALL say 12 of 80, each block row SHALL give its own matching count out of
  its total, and the chart SHALL show the 12 over the faded 80

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
