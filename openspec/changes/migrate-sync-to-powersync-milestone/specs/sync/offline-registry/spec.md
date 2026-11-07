# Spec Delta

## ADDED Requirements

### Requirement: Every synced table is kept on every device, and nothing else is promised

Everything in the reader's regions SHALL be kept on every signed-in device, and the set of kept tables SHALL be stated once, in the sync streams, so that adding a table to a region stream is enough to keep it; there is no second list to update. A screen whose data is deliberately not synced (served on request from the server) SHALL be marked as such in one place, so that offline it says the data is unavailable rather than rendering an empty list.

#### Scenario: A table is added to a region stream

- **WHEN** a developer adds a table to a region stream
- **THEN** every device receives that table's rows for its regions on its next sync without any other edit, and the client schema test fails if the client does not declare the table

#### Scenario: A screen served from the server

- **WHEN** a reader opens, offline, a screen that is served on request rather than synced
- **THEN** the screen states that the data needs a connection and never shows an empty list as if confirmed

### Requirement: The reference data arrives before the guidebook streams

The reference data every screen depends on SHALL be delivered and confirmed before the guidebook streams, so the first screen is never held behind the regions' bulk.

#### Scenario: Cold start on any device

- **WHEN** a device signs in with an empty local store
- **THEN** the first screen renders once the reference data is confirmed, and the guidebook continues arriving behind it

## REMOVED Requirements

### Requirement: Every kept query is preloaded, and nothing excluded is

**Reason**: The kept classes (always, field, personal, excluded) existed because the previous engine preloaded per query and per device class. With region streams every device holds every region it belongs to, so there are no classes and no per-query preload list.
**Migration**: The stream config is the single list. The one surviving distinction, a screen served on request rather than synced, is covered by "Every synced table is kept on every device, and nothing else is promised".

### Requirement: The reference data is preloaded before the guidebook

**Reason**: Restated without the field-device distinction, which no longer exists.
**Migration**: Covered by "The reference data arrives before the guidebook streams".
