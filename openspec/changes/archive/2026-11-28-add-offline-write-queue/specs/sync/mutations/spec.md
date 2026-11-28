# Spec Delta

## MODIFIED Requirements

### Requirement: Writes are refused while disconnected

While the app has no connection to the sync server, a write SHALL be refused before it is applied,
and SHALL NOT be queued or applied later. The one exception is a write that `sync/offline-writes`
keeps on the device in a PowerSync build: it is applied locally at once and sent once the device is
back online.

#### Scenario: Tapping a toggle offline

- **WHEN** a person taps favorite while the app shows that it is offline
- **THEN** the button does not change and a toast says they are offline

#### Scenario: Submitting a form offline

- **WHEN** a person submits a form while offline
- **THEN** the offline state covers the form, the typed values are still there when the connection
  returns, and nothing is written

#### Scenario: Logging an ascent offline in a PowerSync build

- **WHEN** a climber logs an ascent while offline in a PowerSync build
- **THEN** the form finishes, the ascent shows as not uploaded yet, and it is sent once the device is back online
