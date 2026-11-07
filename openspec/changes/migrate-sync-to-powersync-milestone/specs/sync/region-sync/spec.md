# Spec Delta

## Purpose

What a signed-in device holds locally and keeps current: every region the reader belongs to, in full, gated by membership, surviving time away and account changes.

## ADDED Requirements

### Requirement: A device holds every region it belongs to, in full

A signed-in device SHALL receive and keep current the complete guidebook of every region the reader is an active member of (areas, blocks, routes, topos and their images' records, first ascensionists, tags, geolocations), everyone's ascents in those regions, the regions' members (and the names of former members, whose ascents remain), the reader's own favorites and settings, and the reference data every screen needs. This applies to every device, desktop included; there is no per-device subset.

#### Scenario: A member of two regions opens the app on a new device

- **WHEN** a reader who belongs to two regions signs in on a device with no local data
- **THEN** the device downloads both regions completely, and every guidebook screen of either region then renders from local data without a request per screen

#### Scenario: Another member's ascents

- **WHEN** a reader opens a route page or another member's profile in one of their regions
- **THEN** that member's ascents in the region are already on the device and render without a connection

### Requirement: Membership is the only gate on synced data

Rows SHALL reach a device only for regions where the reader's membership is active. Deactivating or removing a membership SHALL stop further rows for that region and remove the region's rows from the device on its next sync. No row of a region the reader does not belong to SHALL ever reach the device, whatever parameters the client sends.

#### Scenario: Membership deactivated while the device is online

- **WHEN** a reader's membership in a region is deactivated
- **THEN** no further change from that region reaches the device, and the region's rows are removed from the device the next time it syncs

#### Scenario: A client asks for a region it does not belong to

- **WHEN** a client requests a stream with a region parameter for a region the reader is not a member of
- **THEN** it receives no rows of that region and no error that reveals whether the region exists

#### Scenario: Membership rules are tested on every run

- **WHEN** the test suite runs
- **THEN** it proves, against a real database, that an insider receives the region's rows, an outsider receives none, and a deactivated member stops receiving them

### Requirement: Reference data arrives before the guidebook

The reference data every screen depends on (the reader's profile and role, grades, role permissions, their regions) SHALL be delivered and confirmed before the guidebook tables, so the first screen is never held behind the regions' bulk.

#### Scenario: Cold start on an empty device

- **WHEN** a device with no local data connects
- **THEN** the first screen renders once the reference data is confirmed, while the guidebook is still arriving

### Requirement: A device catches up without starting over

A device that reconnects after time away SHALL receive only what changed since its last sync, and SHALL NOT download its regions again unless its local data was removed. Compaction of the server's history SHALL NOT force a full download.

#### Scenario: A day offline

- **WHEN** a device reconnects after a day in which its regions saw a few hundred changes
- **THEN** it receives those changes only, on the order of kilobytes, and is caught up within seconds

#### Scenario: Server history compacted meanwhile

- **WHEN** the server compacted its history while the device was away
- **THEN** the device still catches up incrementally

### Requirement: Local data belongs to one account

Local data SHALL be kept per account. A second account signing in on the same device SHALL never see the first account's rows, and signing out SHALL remove the account's local data, including any files left by earlier accounts.

#### Scenario: Two accounts on one device

- **WHEN** account B signs in on a device where account A was signed in before
- **THEN** account B sees none of A's rows, before or after B's first sync

#### Scenario: Sign out

- **WHEN** the reader signs out
- **THEN** their local data is removed from the device, and no data file of any earlier account remains

### Requirement: The first boot after the engine change clears the previous engine's data

The first start of the new engine on a device SHALL remove the previous engine's local store, so a device does not keep two copies of its regions.

#### Scenario: A device that synced with the previous engine

- **WHEN** such a device starts the new build for the first time
- **THEN** the previous engine's local store is gone after the first sync completes, and the reader is not asked to do anything
