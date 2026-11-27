## REMOVED Requirements

### Requirement: The PowerSync build is a local preview until it runs without Zero

**Reason**: The PowerSync build now starts no Zero client, the condition this requirement waited for.
**Migration**: Replaced by "The PowerSync build runs without Zero".

### Requirement: A PowerSync build takes on no new use of the Zero client

**Reason**: The list of remaining users is empty, so a list that may only shrink has nothing left to hold.
**Migration**: Replaced by "A PowerSync build carries no Zero client".

## ADDED Requirements

### Requirement: The PowerSync build runs without Zero

A build that runs PowerSync SHALL read the guidebook, profiles and search from PowerSync, SHALL send every write to the app server's write route, and SHALL read what the device does not hold from the app server. It SHALL start no Zero client and SHALL open no connection to zero-cache, so it works with zero-cache down.

#### Scenario: Logging an ascent in the PowerSync build

- **WHEN** a member logs an ascent in a PowerSync build
- **THEN** the write goes to the write route, and the ascent appears on the route page once PowerSync delivers the new row

#### Scenario: zero-cache is down

- **WHEN** a member uses a PowerSync build while zero-cache is unreachable
- **THEN** the guidebook, the feed, the inbox, comments and writes work, and the page sends nothing to zero-cache

### Requirement: Production builds Zero until the cutover

Production SHALL build with Zero until the cutover, the release that switches production to PowerSync. A preview deployment MAY build with `powersync`, on production data only as one branch's preview that is removed after its check.

#### Scenario: Production

- **WHEN** production is deployed before the cutover
- **THEN** it builds with Zero

#### Scenario: A preview on production data

- **WHEN** a preview builds with `powersync` against production data for a check on a real device
- **THEN** only that branch's previews carry production values, and once the check is done the values are removed and that branch's preview deployments deleted

### Requirement: A PowerSync build carries no Zero client

A build that runs PowerSync SHALL fail when any module imports the Zero client, and SHALL name the module that did.

#### Scenario: A module reaches for the Zero client

- **WHEN** any module imports the Zero client and the app is built with `powersync`
- **THEN** the build fails and names the module

#### Scenario: The Zero build

- **WHEN** the app is built with Zero
- **THEN** the Zero client is imported as before and the build succeeds
