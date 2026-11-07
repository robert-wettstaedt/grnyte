# Spec Delta

## MODIFIED Requirements

### Requirement: The visible screen is answered before background sync

On a device that keeps data for offline use, opening the application SHALL NOT make the visible screen wait behind data it does not show. Reference data is delivered first; a region's guidebook arrives as one unit, so a guidebook screen opened before its region has synced once indicates that data is arriving, and once a region has synced, reopening the application SHALL answer every screen of that region from local data without waiting for any sync.

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
