# Spec Delta

## MODIFIED Requirements

### Requirement: A PowerSync build sends every write to the write route

In a build that runs PowerSync, every write SHALL go to the write route with a write id made on the device, and none SHALL go through the Zero client. While the device is offline, a write SHALL be refused before it is sent unless `sync/offline-writes` keeps it. A send that fails on the network or on the server SHALL be repeated with the same write id before the client reports a failure: the offline message when the device is offline, the general failure message otherwise. A form SHALL keep what was typed.

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

#### Scenario: A queued write offline

- **WHEN** a climber logs an ascent while the device is offline
- **THEN** no request is made until the device is back online, and then one request goes to the write route with the write id the ascent was queued under
