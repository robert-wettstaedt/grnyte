## MODIFIED Requirements

### Requirement: Toggles apply instantly

A toggle (saving a favorite, reacting, changing a file's visibility, a setting) SHALL show its new
state in the same frame as the tap, before the server has answered, in either build.

#### Scenario: Saving a favorite

- **WHEN** a person taps the favorite button on a route
- **THEN** the button shows the saved state immediately and the save count includes it

#### Scenario: The server's row arrives

- **WHEN** the server confirms a saved favorite
- **THEN** the count stays the same, never counting the save twice

#### Scenario: Reacting

- **WHEN** a person taps an emoji on a card or a comment, in either build, or taps another emoji while holding one, or taps the one they hold
- **THEN** the chips show their emoji added, moved or cleared before the server has answered, with the counts and the reactor names to match, and stay so when the read catches up

## ADDED Requirements

### Requirement: A toggle on a synced row holds its tap until the row arrives

A toggle on a row the device syncs (a favorite, a file's visibility, a setting) SHALL keep showing
the tapped state until the device holds the changed row, also when the server answers first. Taps
on one toggle SHALL reach the server in the order they were made, so it ends in the last tap's state.

#### Scenario: Making a file public before its row syncs back

- **WHEN** an editor turns on a file's public link and the server answers before the changed file reaches the device
- **THEN** the switch shows public from the tap on, and never shows private again in between

#### Scenario: Two quick taps on a setting

- **WHEN** a person turns a notification setting off and on again before either change reaches the device
- **THEN** the switch shows each tap at once and ends on, without showing off again in between
