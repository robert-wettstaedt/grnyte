# sync/server-reads Specification

## Purpose
How a client reads data its device does not hold, such as the feed while it is not synced, and which rules decide what the app server answers.

## Requirements

### Requirement: A read the device does not hold is answered by the app server

In a build that runs PowerSync, a read with no synced copy on the device SHALL be answered by the app server, with the rows, in the shape, that the sync engine's query for that read gives the same caller, less any row that row-level security refuses that caller.

#### Scenario: The "last edited" line

- **WHEN** a member opens a route page in a PowerSync build
- **THEN** the line shows the route's latest event, read from the app server, and reads as it does in a Zero build

#### Scenario: The feed

- **WHEN** a member opens the feed in a PowerSync build and in a Zero build over the same data
- **THEN** both show the same cards

### Requirement: The app server answers a read under the caller's own access

The app server SHALL run a read for the signed-in caller only, with that caller's region memberships and under row-level security as that caller. It SHALL refuse a read when the caller's memberships could not be loaded.

#### Scenario: A region the caller does not belong to

- **WHEN** a member asks for the events of a region they are not a member of
- **THEN** the answer holds none of that region's events

#### Scenario: A membership without read access

- **WHEN** a caller whose role in a region does not allow reading it asks for that region's events
- **THEN** the answer holds none of them

#### Scenario: No live session

- **WHEN** a request without a live session asks for a read
- **THEN** it is refused

#### Scenario: Another account in the same browser

- **WHEN** a screen of one account asks for a read after another account signed in to the same browser
- **THEN** the read is refused, and the screen never shows the other account's rows as its own

#### Scenario: Memberships unreadable

- **WHEN** the caller's memberships cannot be loaded
- **THEN** the read is refused, never answered without a region filter

### Requirement: A server read says only what it knows

A screen SHALL treat a server read as answered only once the app server has answered that exact read. Until then it SHALL show loading, or the rows already on screen when the new read only moves the window of the same list, and never an empty result. Offline, a server read that has no answer yet SHALL show as unavailable, not as an error.

#### Scenario: Changing the filter

- **WHEN** a reader switches the feed from all activity to ascents
- **THEN** the feed shows loading until the new answer arrives, and never an empty state left over from the previous answer

#### Scenario: Loading older entries

- **WHEN** a reader loads older feed entries
- **THEN** the entries on screen stay in place while the older ones are fetched

#### Scenario: Opening the inbox offline

- **WHEN** a member opens the inbox in a PowerSync build while the device is offline
- **THEN** the inbox says it needs a connection

### Requirement: A server read is fetched again when it may be stale

A server read on screen SHALL be fetched again after the member's own write succeeds, when the member returns to the app after time away, and when the device comes back online. A repeated fetch that fails, or one that moves the window of a list on screen, SHALL leave the rows on screen.

#### Scenario: An own edit

- **WHEN** a member renames a route in a PowerSync build
- **THEN** the "last edited" line on that page shows the rename without a reload

#### Scenario: Back from the background

- **WHEN** a member returns to the feed after the app was in the background
- **THEN** the feed is fetched again

#### Scenario: Back without signal

- **WHEN** a member returns to an answered feed and the repeated fetch fails
- **THEN** the feed keeps showing its entries, not an error
