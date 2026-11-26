# Spec Delta

## Purpose

How a client's write reaches the app server and the database without the sync engine carrying it, who may send one, and what a client can rely on when the same write is sent more than once.

## ADDED Requirements

### Requirement: A write is one request to the app server

The app server SHALL accept a write as one request that names a mutator, its arguments and a write id. It SHALL run that mutator in one transaction and answer with the mutator's result. A request that names no known mutator, or carries no write id, SHALL be refused and SHALL write nothing.

#### Scenario: Creating an area

- **WHEN** a member who may add areas sends `areas.create` with a name, a region and a write id
- **THEN** the area exists once, and the answer carries its id

#### Scenario: An unknown mutator

- **WHEN** a request names a mutator that does not exist
- **THEN** the app server refuses it and nothing is written

### Requirement: The write route trusts the access token and nothing else

The write route SHALL act for the caller named by a valid access token in the request, whose session is still live. It SHALL NOT read a session cookie. A request without a valid token, or whose session was ended, SHALL be refused before anything is written.

#### Scenario: An expired token

- **WHEN** a write arrives with an expired access token
- **THEN** it is refused as unauthenticated and nothing is written

#### Scenario: A cookie and no token

- **WHEN** a request arrives with a signed-in browser's session cookie and no access token
- **THEN** it is refused as unauthenticated

#### Scenario: A session ended elsewhere

- **WHEN** a write arrives with a token whose session the member ended from another device
- **THEN** it is refused as unauthenticated and nothing is written

### Requirement: A write applies once however often it is sent

The app server SHALL record a write's id in the same transaction as the write. A later request with that id, from the same caller and for the same mutator, SHALL NOT run the mutator again and SHALL get the answer the first request got.

#### Scenario: The answer was lost

- **WHEN** a client sends `areas.create`, the area is created, the answer never arrives, and the client sends the same request again
- **THEN** there is still one area, and the second answer carries the id the first one carried

#### Scenario: Two copies at once

- **WHEN** the same request arrives twice at the same moment
- **THEN** the mutator runs once and both requests get the same answer

### Requirement: A refused write leaves no record

A write that its mutator refuses SHALL change nothing and SHALL NOT record its write id, so the same request sent again is judged again.

#### Scenario: Refused, then allowed

- **WHEN** a write is refused because a name is taken, the other row is renamed, and the same request is sent again
- **THEN** the second request is applied

### Requirement: A write id belongs to one caller and one mutator

A request whose write id was recorded for another caller or for another mutator SHALL be refused, SHALL write nothing and SHALL NOT reveal the recorded answer.

#### Scenario: Another member reuses an id

- **WHEN** member B sends a write with an id that a write of member A recorded
- **THEN** B's request is refused, B learns nothing of A's answer, and nothing is written

### Requirement: The same rules decide a write on either route

A mutator SHALL apply the same permission gate, the same row-level security and the same validation whether its write arrives through zero-cache or through the write route.

#### Scenario: A member without edit rights

- **WHEN** a member who may not edit a route sends `routes.update` through the write route
- **THEN** it is refused as it is through zero-cache, and the route is unchanged

### Requirement: A refusal reaches the client in the application's own words

A refused write SHALL answer with the application's message for the refusal and, where it concerns one field, that field. Text the application did not write, such as a database error, SHALL be replaced by the general failure message.

#### Scenario: A refusal about one field

- **WHEN** a route is saved under a name another route of its block already has
- **THEN** the answer carries the message for a taken name and the field `name`

#### Scenario: A database error

- **WHEN** a mutator fails with a database error
- **THEN** the answer carries the general failure message and none of the error's text

### Requirement: Write ids are kept for 30 days

The app server SHALL delete a recorded write id 30 days after it was recorded, and SHALL delete a member's recorded write ids when their account is deleted.

#### Scenario: The scheduled cleanup

- **WHEN** the scheduled cleanup runs
- **THEN** write ids recorded more than 30 days ago are gone and newer ones remain

### Requirement: A PowerSync build sends every write to the write route

In a build that runs PowerSync, every write SHALL go to the write route with a write id made on the device, and none SHALL go through the Zero client. While the device is offline, a write SHALL be refused before it is sent. A send that fails on the network or on the server SHALL be repeated with the same write id before the client reports a failure: the offline message when the device is offline, the general failure message otherwise. A form SHALL keep what was typed.

#### Scenario: Saving a favorite

- **WHEN** a member saves a route in a PowerSync build
- **THEN** one request goes to the write route, and the route shows as saved

#### Scenario: Another account in the same browser

- **WHEN** a screen of one account sends a write after another account signed in to the same browser
- **THEN** nothing is sent, and no write is made as the other account

#### Scenario: A dropped connection

- **WHEN** a write's first send fails on the network and its second send arrives
- **THEN** the write is applied once and the member sees no error

#### Scenario: Offline

- **WHEN** a member submits a form while the device is offline
- **THEN** the form shows the offline message and no request is made
