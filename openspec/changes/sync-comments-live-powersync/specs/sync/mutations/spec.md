## MODIFIED Requirements

### Requirement: Toggles apply instantly

A toggle (saving a favorite, reacting, changing a file's visibility, a setting) SHALL show its new
state in the same frame as the tap, before the server has answered. A PowerSync build SHALL do so
for saving a favorite, reacting and a setting; there a file's visibility shows its new state once
the server's row arrives.

#### Scenario: Saving a favorite

- **WHEN** a person taps the favorite button on a route
- **THEN** the button shows the saved state immediately and the save count includes it

#### Scenario: The server's row arrives

- **WHEN** the server confirms a saved favorite
- **THEN** the count stays the same, never counting the save twice

#### Scenario: Reacting

- **WHEN** a person taps an emoji on a card or a comment, in either build, or taps another emoji while holding one, or taps the one they hold
- **THEN** the chips show their emoji added, moved or cleared before the server has answered, with the counts and the reactor names to match, and stay so when the read catches up

### Requirement: A refused toggle reverts and explains

When the server refuses a toggle, the system SHALL return it to its previous state and SHALL tell
the person why in a toast. An emoji reaction is the exception: a refused one SHALL return to its
previous state without a toast, since the bar then shows exactly what it showed before the tap.

#### Scenario: Losing access while tapping

- **WHEN** a person taps favorite on a route in a region they were just removed from
- **THEN** the button returns to unsaved and a toast says the route was not found

#### Scenario: A refused emoji

- **WHEN** the server refuses a person's emoji on a card or a comment
- **THEN** the chips show what they showed before the tap, and no toast appears
