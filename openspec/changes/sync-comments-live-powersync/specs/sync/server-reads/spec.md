## MODIFIED Requirements

### Requirement: A server read is fetched again when it may be stale

A server read on screen SHALL be fetched again after the member's own write succeeds, when the member returns to the app after time away, when the device comes back online, and when a synced change marker that covers the read moves. A move while the app is hidden SHALL be acted on once when it is shown again, and not while hidden. A repeated fetch that fails, or one that moves the window of a list on screen, SHALL leave the rows on screen.

#### Scenario: An own edit

- **WHEN** a member renames a route in a PowerSync build
- **THEN** the "last edited" line on that page shows the rename without a reload

#### Scenario: Back from the background

- **WHEN** a member returns to the feed after the app was in the background
- **THEN** the feed is fetched again

#### Scenario: Back without signal

- **WHEN** a member returns to an answered feed and the repeated fetch fails
- **THEN** the feed keeps showing its entries, not an error

#### Scenario: Another member edits what is on screen

- **WHEN** a member has a block's page open with its log in a PowerSync build, and another member of the region renames that block
- **THEN** the log and the "last edited" line show the rename within a few seconds, without a reload or a write of their own

#### Scenario: Another member comments in an open thread

- **WHEN** a member has an event's thread open in a PowerSync build, and another member of the region comments on that event, answers a comment in it, or deletes a comment in it
- **THEN** the thread and the card's comment count show it within a few seconds, without a reload or a write of their own

#### Scenario: Only the reads the marker covers

- **WHEN** the events marker of a member's region moves while the feed, an open thread and the inbox are on screen in a PowerSync build
- **THEN** the event reads and the thread are fetched again and the inbox is not

#### Scenario: A move while hidden

- **WHEN** the events marker moves while the member's app is hidden, and the member shows it again before the time away counts as stale
- **THEN** nothing is fetched while hidden, and the event reads and threads on screen are fetched once on return
