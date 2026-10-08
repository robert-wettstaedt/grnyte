# Spec Delta

## Purpose

Which synced queries a device keeps for use without a connection, and the guarantee that what the
app promises to keep is exactly what it preloads.

## ADDED Requirements

### Requirement: Every kept query is preloaded, and nothing excluded is

Each query the app classifies as kept on every device SHALL be preloaded on every signed-in device,
each query classified as kept on field devices SHALL be preloaded on field devices, and no query
classified as excluded SHALL ever be preloaded. Adding a query to a kept class SHALL be enough to
preload it; there is no second list to update.

#### Scenario: A query is added to the field class

- **WHEN** a developer classifies a new query as kept on field devices
- **THEN** field devices preload it on their next sign-in without any other edit, or the build fails
  because the classification does not say how to build its request

#### Scenario: A kept query that needs a looked-up argument

- **WHEN** a kept query needs the signed-in user's id or region list as its argument
- **THEN** it is preloaded once that value is known, and a failed lookup leaves the rest of the
  preload unaffected

### Requirement: The reference data is preloaded before the guidebook

The queries every screen depends on SHALL be preloaded and confirmed before any field-device
preload starts, so the first screen is never held behind the guidebook.

#### Scenario: Cold start on a field device

- **WHEN** a field device signs in with an empty local store
- **THEN** the first screen renders once the reference data is confirmed, and the guidebook preload
  starts only after that
