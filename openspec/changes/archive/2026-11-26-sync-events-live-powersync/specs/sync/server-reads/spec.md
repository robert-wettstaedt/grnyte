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

#### Scenario: Only the reads the marker covers

- **WHEN** the events marker of a member's region moves while the feed and the inbox are open in a PowerSync build
- **THEN** the event reads are fetched again and the inbox is not

#### Scenario: A move while hidden

- **WHEN** the events marker moves while the member's app is hidden, and the member shows it again before the time away counts as stale
- **THEN** nothing is fetched while hidden, and the event reads on screen are fetched once on return

## ADDED Requirements

### Requirement: The feed's "N new" pill and seen mark work in either build

The feed SHALL count events that arrived after the reader's mark in the pill while the feed is open, in a Zero build and in a PowerSync build alike. Taking them in, or the first window the reader is shown, SHALL record the reader's seen mark on the server, so the push digest does not repeat what was read. In a PowerSync build the feed SHALL do both without the Zero client.

#### Scenario: Another member logs an ascent

- **WHEN** a member has the feed open in a PowerSync build and another member of the region logs an ascent
- **THEN** the pill shows one new entry within a few seconds, and the list on screen does not move

#### Scenario: Taking in the new entries

- **WHEN** the reader presses the pill
- **THEN** the new entries join the top of the list, the pill goes, and the reader's seen mark on the server moves to the newest entry

#### Scenario: A filtered feed

- **WHEN** the reader has the feed narrowed to one region or one person and presses the pill
- **THEN** the entries join the list and the seen mark on the server does not move

#### Scenario: The feed in a PowerSync build

- **WHEN** the app is built with `powersync`
- **THEN** the feed's module does not import the Zero client, and the build's guard lists no feed module
