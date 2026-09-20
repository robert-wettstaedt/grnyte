## Purpose

Governs what the interface may state about synced data that has not finished arriving, so that a
gap in the sync is never presented to a reader as a fact about the guidebook. Applies wherever a
surface renders synced data, and matters most on a slow or intermittent connection at a crag.

## ADDED Requirements

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
failure or timeout claim.

#### Scenario: Partial collection

- **WHEN** some rows of a collection have arrived and more are expected
- **THEN** the arrived rows are rendered
- **AND** an indication that more are expected is shown alongside them

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

### Requirement: No unresolvable progress indication

A surface SHALL NOT show a progress indication that cannot resolve. Where nothing can complete the
query, the surface states the condition instead.

#### Scenario: Offline with a query that has never synced

- **WHEN** the reader is offline and the query has never been confirmed on this device
- **THEN** the surface states that the data is unavailable rather than indicating progress
