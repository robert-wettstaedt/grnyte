## ADDED Requirements

### Requirement: Saving again after a lost answer applies once

In a PowerSync build, when a write the client reported as failed was the last write the tab began,
and the next write the tab begins is the same write (the same mutator with the same arguments), it
SHALL go out under the failed write's id, within 60 seconds of the failure and while no toggle on synced
data has appeared or seen its row change since the write began. Every other write SHALL get a new write id.

#### Scenario: Saving again after a lost answer

- **WHEN** the server commits a new route but no answer reaches the device, the form reports the failure, and the member presses Save again without changing anything
- **THEN** the route exists once, and the form goes on as after a successful save

#### Scenario: Saving changed values after a failure

- **WHEN** a form reported a failure and the member changes a field and presses Save again
- **THEN** the write goes out under a new write id and is applied as a new write

#### Scenario: Undo in between

- **WHEN** a save of a favorite reports a failure although the server committed it, the member then unsaves it successfully, and saves it again
- **THEN** the last save goes out under a new write id and the route ends saved

#### Scenario: The row changed elsewhere after a lost answer

- **WHEN** a member's tap making a file private is committed but its answer is lost, another device then makes the file public, and the member taps private again
- **THEN** the tap goes out under a new write id and the file ends private

#### Scenario: Saving again much later

- **WHEN** a form reported a failure more than a minute ago and the member presses Save again without changing anything
- **THEN** the write goes out under a new write id

#### Scenario: Quick taps

- **WHEN** a member turns a setting off, on and off again while the first write is still on its way
- **THEN** each tap goes out under its own write id

#### Scenario: Another write while the first is still being resent

- **WHEN** a form's save is still being resent, the member saves a favorite and gets an answer, the form's save then reports a failure, and the member presses Save again without changing anything
- **THEN** the form's save goes out under a new write id

## MODIFIED Requirements

### Requirement: The same rules decide a write on either route

A mutator SHALL apply the same permission gate, the same row-level security and the same validation whether its write arrives through zero-cache or through the write route. CI SHALL run every test that writes through a mutator once through each route on every pull request.

#### Scenario: A member without edit rights

- **WHEN** a member who may not edit a route sends `routes.update` through the write route
- **THEN** it is refused as it is through zero-cache, and the route is unchanged

#### Scenario: A mutator that differs on the write route

- **WHEN** a pull request makes a mutator answer differently through the write route than through zero-cache, and a test covers it
- **THEN** CI fails on that pull request
