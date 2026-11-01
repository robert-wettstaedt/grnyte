## ADDED Requirements

### Requirement: A block carries a summary of its live routes

Every block SHALL carry, for its routes that are not deleted, how many hold each community grade and how many hold
none. The summary SHALL be current as soon as any write that adds, removes, deletes, restores, regrades or moves a
route commits, whoever made the write and whatever their permissions, and whether it came from the app or a
maintenance script.

#### Scenario: A reader's ascent changes the community grade

- **WHEN** a member who may only read logs an ascent whose suggested grade moves a route's community grade from 6A
  to 6A+
- **THEN** that route's block SHALL count one route fewer at 6A and one more at 6A+

#### Scenario: A route moves to another block

- **WHEN** an editor moves a route from one block to another
- **THEN** the first block SHALL count it no longer and the second SHALL count it at its grade

#### Scenario: A route is deleted and restored

- **WHEN** a route is deleted and then restored
- **THEN** its block SHALL stop counting it on delete and count it again on restore

#### Scenario: A route without a grade

- **WHEN** a route has no community grade
- **THEN** its block SHALL count it among the routes without a grade, and in its route total

#### Scenario: A bulk script

- **WHEN** a maintenance script creates, moves or deletes routes in bulk, including one that runs with triggers off
- **THEN** every affected block's summary SHALL match its live routes once the script commits

### Requirement: The unfiltered map draws from the summaries

With no route filter and no search text active, the map SHALL draw every block's marker, route count and grade donut
from the block summaries, and SHALL NOT need any route of the region on the device to do so. The count and donut
SHALL equal what counting the block's live routes gives.

#### Scenario: Opening the explore map

- **WHEN** a reader opens the explore map with no filter and no search, on a device that does not keep the
  guidebook for offline use
- **THEN** every block SHALL show its marker with its route count and grade donut, and no route rows SHALL be
  requested for the map

#### Scenario: A large region

- **WHEN** a reader opens the map of a region with 8,000 routes, on a device that does not keep the guidebook for
  offline use
- **THEN** the map SHALL show every block's count and donut without syncing those 8,000 routes

#### Scenario: A device that keeps the guidebook offline

- **WHEN** a device that keeps every route for offline use opens the map, or returns to it after the sync
  connection was dropped
- **THEN** the map SHALL still draw from the summaries, and SHALL request the region's routes as well, so a
  resumed connection does not send the kept routes again
