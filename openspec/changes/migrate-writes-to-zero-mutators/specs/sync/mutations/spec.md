# Spec Delta

## Purpose

Defines how a write behaves for the person making it, on every client, and what the server
guarantees about every write: who may make it, that it happens once, and what it reveals when it
is refused.

## ADDED Requirements

### Requirement: Toggles apply instantly

A toggle (saving a favorite, reacting, changing a file's visibility, a setting) SHALL show its new
state in the same frame as the tap, before the server has answered.

#### Scenario: Saving a favorite

- **WHEN** a person taps the favorite button on a route
- **THEN** the button shows the saved state immediately and the save count includes it

#### Scenario: The server's row arrives

- **WHEN** the server confirms a saved favorite
- **THEN** the count stays the same, never counting the save twice

### Requirement: A refused toggle reverts and explains

When the server refuses a toggle, the system SHALL return it to its previous state and SHALL tell
the person why in a toast.

#### Scenario: Losing access while tapping

- **WHEN** a person taps favorite on a route in a region they were just removed from
- **THEN** the button returns to unsaved and a toast says the route was not found

### Requirement: Forms, creates and deletes wait for the server

Submitting a form, creating an entity or deleting one SHALL wait for the server's answer before
leaving the screen or confirming, and SHALL show the submit as pending meanwhile.

#### Scenario: Saving an edit

- **WHEN** a person saves a route's details
- **THEN** the save button shows pending until the server answers, then the screen exits to the
  route

#### Scenario: Creating a route

- **WHEN** a person adds a route
- **THEN** the screen leaves for the new route's page only once the server has assigned its id

### Requirement: A refused form keeps what was typed

When the server refuses a form, the form SHALL stay open with every value the person entered, and
SHALL show the reason on the field it concerns, or at the top of the form when it concerns no
single field.

#### Scenario: A duplicate name

- **WHEN** a person renames a route to the name of another route on the same block and saves
- **THEN** the form stays open, the name field shows that the name exists, and every other field
  keeps its value

#### Scenario: Stale lists

- **WHEN** a person saves a route whose tags changed elsewhere after the form loaded
- **THEN** the form stays open and says at the top that the lists changed, and nothing is saved

### Requirement: Saving a form never drops what it did not show

Saving a form SHALL write every field the form holds, including fields kept outside text inputs
(grade, rating, tags, first ascensionists, pins), and SHALL never clear a value the person did not
change.

#### Scenario: Changing only the year

- **WHEN** a person changes only a route's first-ascent year and saves
- **THEN** the route keeps its grade, rating, tags and first ascensionists

### Requirement: Writes are refused while disconnected

While the app has no connection to the sync server, a write SHALL be refused before it is applied,
and SHALL NOT be queued or applied later.

#### Scenario: Tapping a toggle offline

- **WHEN** a person taps favorite while the app shows that it is offline
- **THEN** the button does not change and a toast says they are offline

#### Scenario: Submitting a form offline

- **WHEN** a person submits a form while offline
- **THEN** the offline state covers the form, the typed values are still there when the connection
  returns, and nothing is written

### Requirement: Deletes can be undone

A delete SHALL offer an undo once the server has confirmed it, and undoing SHALL restore the entity
as it was.

#### Scenario: Undoing a route delete

- **WHEN** a person deletes a route and taps undo in the toast
- **THEN** the route comes back with its grade, tags and first ascensionists

### Requirement: Every write is checked against stored data

The server SHALL decide every write's permission from the stored rows it acts on and the caller's
current region membership, never from values the client sent, and SHALL refuse a write the caller
may not make without applying any of it.

#### Scenario: Editing a route in a foreign region

- **WHEN** a client sends an edit for a route in a region the caller does not belong to
- **THEN** the server refuses it, no row changes, and the client reverts its local copy

### Requirement: A write happens once

A write SHALL take effect at most once, however often the client or the sync server resends it, and
its side effects (notifications, push, email, storage cleanup) SHALL happen at most once per write.

#### Scenario: A lost response

- **WHEN** the server applies a write but the answer never reaches the sync server, which sends it
  again
- **THEN** the second delivery changes nothing and sends no second notification

#### Scenario: A rolled-back write

- **WHEN** a write fails after it began and its transaction rolls back
- **THEN** no notification, push or email for it is sent

### Requirement: An invitation shows whether its email went out

Each pending invitation SHALL show whether its most recent email was accepted for delivery, and an
invitation whose last email was not accepted SHALL say so and offer a resend.

#### Scenario: The mail provider refuses the send

- **WHEN** an admin invites an address and the mail provider refuses the email
- **THEN** the invitation is saved, and its row says the email was not delivered and offers a resend

#### Scenario: A delivered invitation

- **WHEN** an admin invites an address and the email is accepted
- **THEN** the invitation's row says when it was sent

### Requirement: A refusal reveals nothing internal

A refused write SHALL tell the client only a translated, user-facing reason and, where it applies,
the field it concerns. It SHALL NOT pass on database errors, stored values or stack traces.

#### Scenario: An unexpected database error

- **WHEN** a write fails with a database error that quotes row values
- **THEN** the client receives only the generic server-error message and the details go to the
  server log

### Requirement: Writes need a signed-in session

The write endpoint SHALL reject a request without a valid session token in a way that keeps the
client's pending writes for after it signs in again, rather than discarding them.

#### Scenario: An expired token

- **WHEN** a write arrives with an expired token
- **THEN** the server answers unauthorized, and the client asks for a new token instead of dropping
  the write

### Requirement: Open tabs survive the deploy

A deploy that changes the write path SHALL keep working for tabs that loaded the previous client
until they reload, and a mutation's arguments SHALL NOT be renamed or tightened in the same release
that changes the client sending them.

#### Scenario: A tab open across the deploy

- **WHEN** a person saves a form in a tab loaded before the release that introduced mutators
- **THEN** the save succeeds through the previous write endpoint
