# Spec Delta

## Purpose

Which writes a PowerSync build keeps on the device until they can be sent, how they show before the server confirms them, what a person learns when the server refuses one later, and what happens to writes still waiting when the account signs out.

## ADDED Requirements

### Requirement: A queued write is kept on the device until it is sent

In a PowerSync build, a write that its mutator marks as queueable SHALL be kept on the device and sent once the device can reach the app server, whether the device was online or offline when the write was made. Closing the app, reloading or restarting the device SHALL NOT lose it. Logging an ascent is queueable; every other write keeps the rules of `sync/write-path`.

#### Scenario: An ascent logged in airplane mode

- **WHEN** a climber logs an ascent in airplane mode, closes the app, and opens it again with a connection
- **THEN** the ascent reaches the server and exists there once

#### Scenario: A write that is not queueable

- **WHEN** a person edits an ascent while offline
- **THEN** the edit is refused as offline, and nothing is kept for later

### Requirement: Queued writes are sent in the order they were made

A device SHALL send its queued writes one at a time in the order they were made. A write the server refused SHALL NOT hold back the writes after it. A write that failed on the network, on an unreachable server, on a rate limit or on an access token that could not be renewed SHALL be sent again later, and the writes after it SHALL wait for it. A write the server fails on three times in a row SHALL count as refused with the general failure message.

#### Scenario: A refusal in the middle

- **WHEN** three ascents are queued and the server refuses the second
- **THEN** the first and third are applied

#### Scenario: The server is down

- **WHEN** the device is back online but the app server cannot be reached behind its gateway
- **THEN** the queued writes stay on the device and are sent again later, in the same order

#### Scenario: A write the server always fails on

- **WHEN** the server fails with an internal error on the first of two queued ascents, three times in a row
- **THEN** that ascent counts as refused, the second is sent, and the device's sync goes on

### Requirement: A queued write shows at once and is marked until confirmed

A queued write SHALL show its result at once on every screen that shows such rows, with a "Not uploaded yet" mark, and SHALL count in that person's counts and statistics. Once the server's copy reaches the device, it SHALL replace the queued one without a gap and the mark SHALL go.

#### Scenario: The route page while offline

- **WHEN** a climber logs an ascent offline and returns to the route
- **THEN** the ascent is in the route's list with the "Not uploaded yet" mark

#### Scenario: Back online

- **WHEN** that ascent is sent and the server's copy arrives
- **THEN** the list shows one ascent, without the mark, and it never disappears in between

### Requirement: A row waiting to upload cannot be edited or deleted

A row created by a queued write SHALL NOT be edited or deleted until the server's copy has reached the device. Trying SHALL say it is waiting to upload.

#### Scenario: An ascent not uploaded yet

- **WHEN** a climber looks at an ascent that has not uploaded yet
- **THEN** it offers no edit, delete or link to its own page, and says it is waiting to upload

### Requirement: A form waits briefly for the server when online

When a queueable write is made from a form while the device is online, the form SHALL wait up to about 10 seconds for the server's answer and SHALL show a refusal on the form as for any other write. Offline, or when no answer arrives in time, the form SHALL finish and say that the write is saved on this device and will upload once online.

#### Scenario: A refusal while online

- **WHEN** a climber online logs an ascent on a route that was deleted a moment earlier
- **THEN** the form shows the refusal and keeps the typed values

#### Scenario: Offline

- **WHEN** a climber logs an ascent offline
- **THEN** the form finishes at once and says the ascent is saved on this device and will upload once online

### Requirement: A write with photos attached is not queued

A write whose form has photos or videos attached SHALL NOT be queued: it SHALL be sent at once like any other write, refused while offline, and its failure SHALL be reported on the form. While offline, the form SHALL NOT take new photos or videos and SHALL say that they need a connection.

#### Scenario: Logging an ascent with a photo offline

- **WHEN** a climber attached a photo while online, loses the connection, and saves
- **THEN** the form shows the offline message, keeps the values and the photo, and nothing is queued

#### Scenario: Adding a photo offline

- **WHEN** a climber opens the ascent form while offline
- **THEN** the photo field cannot be used and says photos need a connection

### Requirement: A refusal that arrives later is shown until dismissed

When the server refuses a queued write after its form has finished, the device SHALL keep the refusal with the application's message and the values that were entered. A notice SHALL show every refusal not yet dismissed, offering to dismiss it and, when the form's subject is still on the device, to open the form again with those values. It SHALL stay across reloads until dismissed. The queued row SHALL disappear.

#### Scenario: The route was deleted while the climber was offline

- **WHEN** a climber logs an ascent offline, the route is deleted meanwhile, and the device comes back online
- **THEN** the ascent disappears from the lists, and a notice says it could not be saved and why, offering only to dismiss it

#### Scenario: Opening a refusal

- **WHEN** a queued ascent was refused because the server failed on it three times, and its route still exists
- **THEN** the notice offers to open it, and opening it shows the ascent form for that route filled with the entered values

#### Scenario: Dismissed

- **WHEN** the climber dismisses the refusal
- **THEN** the notice no longer shows it, also after a reload

### Requirement: A queued create applies once however late it is sent

A create sent from the queue SHALL carry an id made on the device. However often and however late it is sent, the server SHALL make at most one row for that id. An id that already belongs to another person's row SHALL be refused without revealing anything about that row.

#### Scenario: Sent again after five weeks

- **WHEN** a queued ascent was applied but its answer was lost, and the device sends it again five weeks later
- **THEN** there is still one ascent, and the answer names it

#### Scenario: Another person's id

- **WHEN** a request creates an ascent with an id that another member's ascent has
- **THEN** it is refused, nothing is written, and the answer says nothing about the other ascent

### Requirement: Signing out does not silently drop queued writes

Signing out on the device SHALL first try to send any queued writes when the device is online. If writes remain, the person SHALL be asked before they are discarded, and may choose to wait instead. A session ended from elsewhere SHALL remove the device's data as today, queued writes included. An expired access token is not a sign-out: the queued writes SHALL be sent once it is renewed.

#### Scenario: Signing out with one ascent left

- **WHEN** a climber signs out offline with one ascent not uploaded
- **THEN** they are told that one change has not uploaded and will be lost, and can wait or sign out anyway

#### Scenario: Signed out from another device

- **WHEN** a climber's session on a phone is ended from a laptop while an ascent is queued on the phone
- **THEN** the phone's data is removed, the queued ascent with it, and nothing is sent

#### Scenario: A token that expired offline

- **WHEN** a climber's access token expires during two days offline with an ascent queued, and the phone comes back online
- **THEN** the token is renewed and the ascent is sent
