# query-readiness Specification

## Purpose

Governs what the interface may state about synced data that has not finished arriving, so that a
gap in the sync is never presented to a reader as a fact about the guidebook. Applies wherever a
surface renders synced data, and matters most on a slow or intermittent connection at a crag.

## Requirements

### Requirement: Absence is never claimed from incomplete data

The interface SHALL NOT state that something does not exist, or that a collection is empty, while
the query that would have produced it has not been confirmed complete by the server at least once
for the arguments in use.

#### Scenario: Empty result that is still arriving

- **WHEN** a surface renders a collection whose query has returned no rows and has never been
  confirmed complete
- **THEN** the surface indicates that data is still arriving
- **AND** it does not state that the collection is empty

#### Scenario: Empty result that is confirmed

- **WHEN** the server has confirmed the query complete and the result is genuinely empty
- **THEN** the surface states the absence plainly

#### Scenario: A surface combining several synchronized queries

- **WHEN** a surface reads data joined on the device from several queries
- **THEN** it is not confirmed complete until every one of those queries is
- **AND** until then it does not state that anything is absent

### Requirement: Unavailable, arriving and complete are distinguishable

A reader SHALL be able to tell three conditions apart: data that is not on this device and is not
coming until the connection returns, data that is arriving now, and data that is complete.

#### Scenario: Offline with nothing stored locally

- **WHEN** the reader is offline and the surface holds no local rows for the query
- **THEN** the surface states that the data is unavailable
- **AND** it distinguishes data deliberately not kept for offline use from data merely not yet
  downloaded

#### Scenario: Connected and still arriving

- **WHEN** the connection is alive and rows are still arriving
- **THEN** the surface presents whatever rows have arrived together with an indication that more
  are expected

#### Scenario: Complete

- **WHEN** the query has been confirmed complete
- **THEN** the surface presents the data with no readiness indication

### Requirement: A confirmed query does not become unconfirmed

Once a query has been confirmed complete for a given set of arguments, the interface SHALL continue
to treat it as settled for as long as that surface is open, including when the connection is
subsequently lost or suspended.

#### Scenario: Connection drops while a form is open

- **WHEN** a form has opened on confirmed data and the connection is then lost
- **THEN** the form remains usable and is not torn down or reset

#### Scenario: Backgrounded surface loses its connection

- **WHEN** a surface is backgrounded long enough for the sync connection to be dropped deliberately
- **THEN** controls gated on readiness remain enabled on return

### Requirement: Arriving data is shown, not withheld

A surface SHALL render the rows it already holds rather than withholding all content until the
query completes, and the indication that more is expected SHALL persist without converting into a
failure or timeout claim. The one exception is a newest-first window with a row limit opened for the
first time (the activity feed): rows another query left on the device are not its newest, so it
SHALL wait for its first confirmed answer instead of showing them, and only that answer counts as
read.

#### Scenario: Partial collection

- **WHEN** some rows of a collection have arrived and more are expected
- **THEN** the arrived rows are rendered
- **AND** an indication that more are expected is shown alongside them

#### Scenario: The feed opened after a page left older events on the device

- **WHEN** the only events on the device are one route's, and the reader opens the activity feed
- **THEN** the feed shows its loading state until its window is confirmed, then the newest events
- **AND** no "new activity" count claims the events that were newer than the route's

#### Scenario: Arrival stalls indefinitely

- **WHEN** rows stop arriving and the connection remains alive
- **THEN** the indication persists
- **AND** the surface does not claim an error, a timeout, or that the data is unavailable

### Requirement: Derived totals require a confirmed query

A count, tally, histogram, position within a set, or any other value asserting something about a
collection as a whole SHALL NOT be presented while that collection is unconfirmed. A value that
describes only the rows on screen MAY be presented before confirmation.

#### Scenario: Consensus drawn from a partial collection

- **WHEN** a surface would summarise a collection that is still arriving
- **THEN** the summary is withheld until the collection is confirmed

#### Scenario: Value describing only what is shown

- **WHEN** a value describes only the rows currently rendered rather than the whole collection
- **THEN** it may be presented before confirmation

### Requirement: A replacing write is seeded only from confirmed data

Where submitting a form replaces a collection rather than patching it, the form SHALL be seeded only
from data the server has confirmed complete, and SHALL NOT be seeded from a readiness verdict that
was retained across a lost connection. The submission SHALL carry a description of what it loaded,
and the handler SHALL refuse a submission that does not match before performing any write.

#### Scenario: Form opened before related data arrived

- **WHEN** an entity's own row is available locally but its related collections are still arriving
- **THEN** the form does not seed
- **AND** it indicates that data is still arriving

#### Scenario: Submission describes a different set than the server holds

- **WHEN** a submission's description of what it loaded does not match what the server holds
- **THEN** the handler refuses the submission before its first write

### Requirement: A resumed session re-establishes its connection before trusting it

On returning to the foreground, the application SHALL NOT go on presenting synced data as current on
the strength of a connection state established before it was suspended. Where that connection is no
longer alive, the application SHALL detect this and reconnect without first waiting out an idle
interval.

This exists because the failure it describes is invisible to every other requirement here: a
connection that died while the application was away is still reported as healthy until the sync
layer next probes it, so the data reads as complete, no absence is claimed, and nothing is arriving.
Every requirement above is satisfied while the reader looks at superseded content.

#### Scenario: Resuming with a connection that died while suspended

- **WHEN** the application returns to the foreground and its connection no longer works, although
  nothing has yet reported that
- **THEN** the application establishes that for itself and reconnects
- **AND** data written while it was away appears without the reader retrying, reloading or
  navigating

#### Scenario: Resuming with a connection that is still alive

- **WHEN** the application returns to the foreground and its connection still works
- **THEN** it keeps that connection
- **AND** the reader sees no interruption

### Requirement: The visible screen is answered before background sync

On a device that keeps data for offline use, the queries of the screen being viewed SHALL be
answered before the offline guidebook sync is requested. Opening the application SHALL NOT make the
visible screen wait behind data it does not show.

This exists because the resume requirement above can be fully satisfied, the connection detected and
re-established promptly, while the reader still waits: a device away for more than a few seconds
resynchronizes its whole offline guidebook on return, and a screen requested behind that waits for
all of it.

#### Scenario: Opening the feed on an installed device

- **WHEN** the application is opened on an installed device after being away, and new activity
  exists in the reader's regions
- **THEN** the feed indicates the new activity without waiting for the offline guidebook to finish
  synchronizing

#### Scenario: The guidebook still synchronizes

- **WHEN** the visible screen's queries have been answered
- **THEN** the offline guidebook synchronization begins
- **AND** a device that stays connected until it completes is recorded as holding the guidebook

### Requirement: Synchronizing the offline guidebook does not drop the connection

Synchronizing the offline guidebook SHALL NOT cause the application's connection to be judged dead
and re-established, on this device or on any other device served by the same sync capacity.

This exists because the guidebook can be satisfied by every requirement above, answered after the
visible screen and complete in the end, while the work of producing it stalls the server long enough
that the connection is torn down and the whole synchronization starts again.

#### Scenario: Opening the application on an installed device

- **WHEN** an installed device opens the application after being away and the offline guidebook
  synchronizes in full
- **THEN** the connection stays established throughout
- **AND** no query is synchronized a second time because of a reconnect

#### Scenario: Another reader opening the application at the same time

- **WHEN** one installed device is synchronizing the offline guidebook and another reader is using
  the application
- **THEN** the other reader's connection is not dropped by that synchronization

#### Scenario: The offline promise survives the reshaping

- **WHEN** an installed device has synchronized the guidebook and loses its connection
- **THEN** a route shows everything it shows online, other than activity deliberately kept off the
  device

### Requirement: No unresolvable progress indication

A surface SHALL NOT show a progress indication that cannot resolve. Where nothing can complete the
query, the surface states the condition instead.

#### Scenario: Offline with a query that has never synced

- **WHEN** the reader is offline and the query has never been confirmed on this device
- **THEN** the surface states that the data is unavailable rather than indicating progress

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
