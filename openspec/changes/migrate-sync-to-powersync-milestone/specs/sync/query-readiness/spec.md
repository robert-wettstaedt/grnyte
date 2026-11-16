# Spec Delta

## MODIFIED Requirements

### Requirement: The visible screen is answered before background sync

On a device that keeps data for offline use, opening the application SHALL NOT make the visible screen wait behind data it does not show. Reference data is delivered first, then a region's map places, then the rest of its guidebook. A guidebook screen opened before the data it shows has synced once indicates that data is arriving, and once a region has synced, reopening the application SHALL answer every screen of that region from local data without waiting for any sync, except that while online a part of a screen that would claim "none" (an empty list, a zero count) MAY wait until its stream confirms in this session.

This exists because a device away for more than a few seconds catches up on return, and a screen requested behind that must not wait for all of it.

#### Scenario: Opening the feed on an installed device

- **WHEN** the application is opened on an installed device after being away, and new activity
  exists in the reader's regions
- **THEN** the feed indicates the new activity without waiting for the regions' guidebook catch-up to finish

#### Scenario: The guidebook still synchronizes

- **WHEN** the reference data has been confirmed
- **THEN** the regions' guidebook synchronization begins
- **AND** a device that stays connected until it completes is recorded as holding the guidebook

#### Scenario: Reopening a region that has synced before

- **WHEN** the application is reopened on a device whose regions synced once before
- **THEN** every guidebook screen renders from local data at once, and catching up on changes happens behind it
- **AND** while online, a part of a screen that would claim "none" (an empty list, a zero count) waits until its stream confirms in this session (offline it answers from disk), which in WebKit can take as long as the reconnect's full checkpoint

### Requirement: A resumed session re-establishes its connection before trusting it

On returning to the foreground after more than a few seconds away, the application SHALL NOT go on presenting synced data as current on the strength of a connection state established before it was suspended. Where the sync layer cannot tell a live connection from a dead one, the application SHALL re-establish it on such a return without first waiting out an idle interval, and SHALL say it is catching up until the re-established connection has delivered current data.

This exists because the failure it describes is invisible to every other requirement here: a connection that died while the application was away is still reported as healthy until the sync layer next probes it, so the data reads as complete, no absence is claimed, and nothing is arriving. Every requirement above is satisfied while the reader looks at superseded content.

#### Scenario: Resuming with a connection that died while suspended

- **WHEN** the application returns to the foreground after more than a few seconds away and its connection no longer works, although nothing has yet reported that
- **THEN** the application re-establishes the connection
- **AND** data written while it was away appears without the reader retrying, reloading or navigating
- **AND** until it does, the application says it is catching up, never that it is current

#### Scenario: Resuming with a connection that is still alive

- **WHEN** the application returns to the foreground within a few seconds, while its connection still works
- **THEN** it keeps that connection and shows nothing
- **AND** after a longer absence it re-establishes the connection even if it still works, where the sync layer cannot tell the two apart

#### Scenario: A catch-up that never completes

- **WHEN** the re-established connection has delivered no current data 30 seconds after it was re-established
- **THEN** the application says it is not getting updates and offers a reload
