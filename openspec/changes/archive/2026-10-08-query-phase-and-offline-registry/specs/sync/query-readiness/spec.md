# Spec Delta

## ADDED Requirements

### Requirement: One query reads the same everywhere

Every screen showing the same synced query SHALL describe its state the same way: loading, arriving
(rows shown, more expected, connection up), answered, unavailable offline, or failed. No screen may
treat a query as still arriving while another treats it as answered, and no screen may show a total
or an absence for a query that is not answered.

#### Scenario: Two screens read one query mid-sync

- **WHEN** the same query feeds a page section and a sheet while its rows are still arriving
- **THEN** both show it as arriving: rows where there are rows, no count, and no "none" claim

#### Scenario: The connection drops after the answer

- **WHEN** a query has been answered and the socket then parks
- **THEN** every screen keeps showing it as answered, with its total

#### Scenario: A query that never answered goes offline

- **WHEN** the device goes offline before a query not kept for offline use was ever answered
- **THEN** every screen showing it says it is unavailable offline, never loading forever and never
  empty

### Requirement: A screen's fallback is decided the same way everywhere

Wherever a screen shows something instead of its content (a list, a detail page or a form), the
choice SHALL follow one order: unavailable offline, then failed, then not found, then no
permission, then loading. The failure state SHALL look the same on every screen.

#### Scenario: A detail page and a form for a missing row

- **WHEN** a deep link names a row that does not exist, once on its detail page and once on its
  edit form
- **THEN** both keep their header and say the row was not found, in the same wording and layout

#### Scenario: Offline beats loading

- **WHEN** a screen's row was never synced to this device and the device is offline
- **THEN** it shows the offline notice, on lists, detail pages and forms alike

### Requirement: A form's fields render only with the rows they were seeded from

An add or edit form SHALL render its fields only once every row it waits for is present, and an
edit form whose submit replaces related lists SHALL wait for those rows whole by default. The fields
SHALL be seeded from those same rows, so a form can never submit values seeded from a row other
than the one on screen.

#### Scenario: Editing a route whose tags are still syncing

- **WHEN** an edit form opens on a route whose tags and first ascensionists have not all arrived
- **THEN** the form shows its header with Save disabled until they have, and then seeds from them

#### Scenario: Moving between two entities on the same form route

- **WHEN** the reader goes from one entity's edit form to another's without leaving the route
- **THEN** the fields re-seed from the second entity's rows before they are shown
