## MODIFIED Requirements

### Requirement: PowerSync alone decides the connection state in its build

In a build that runs PowerSync, the online flag and the status bar SHALL take the sync connection from PowerSync and from no other engine, beside the browser's flag and the reachability probe. A connection short of connected SHALL read as reconnecting, and as offline once it has lasted 10 seconds on a visible page, at a launch too. It SHALL NOT read as a state only a reload leaves, except for the stalled catch-up after a return.

#### Scenario: The sync service goes away

- **WHEN** PowerSync loses its connection and has none for 10 seconds on a visible page
- **THEN** the status bar says the device is offline, and it clears once PowerSync is connected again

#### Scenario: Launched while the sync service is down

- **WHEN** the app opens its database and PowerSync never connects for 10 seconds on a visible page
- **THEN** the status bar says the device is offline

#### Scenario: The Zero client fails

- **WHEN** zero-cache is unreachable and PowerSync stays connected
- **THEN** the status bar shows nothing and the app stays online, as the build starts no Zero client that could fail

#### Scenario: Signal lost with a connection that has not noticed

- **WHEN** the browser reports offline and PowerSync reports another status on the connection it still holds, with no newer checkpoint
- **THEN** the app stays offline

#### Scenario: A Zero build

- **WHEN** the app is built with Zero
- **THEN** the connection state and the sign-in recovery come from Zero's connection
