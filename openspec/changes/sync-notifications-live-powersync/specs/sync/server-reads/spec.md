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
- **THEN** the event reads are fetched again and the inbox and the unread count are not

#### Scenario: Only the reads the account's marker covers

- **WHEN** the member's notifications marker moves while the feed is open in a PowerSync build
- **THEN** the unread count is fetched again and the event reads are not

#### Scenario: A move while hidden

- **WHEN** the events marker moves while the member's app is hidden, and the member shows it again before the time away counts as stale
- **THEN** nothing is fetched while hidden, and the event reads on screen are fetched once on return

## ADDED Requirements

### Requirement: The inbox and the unread count follow new notifications in either build

A notification aimed at the member SHALL show in the open inbox and in the unread count (the bell on the feed, the dot on the feed tab while another tab is open, and the installed app's badge) within a few seconds, without a reload or a write of their own, in a Zero build and in a PowerSync build alike.

#### Scenario: A notification while the feed is open

- **WHEN** a member has the feed open in a PowerSync build and another member's action sends them a notification
- **THEN** the bell shows one more unread within a few seconds

#### Scenario: A notification while another tab is open

- **WHEN** a member has the explore map open in a PowerSync build and a notification aimed at them arrives
- **THEN** the dot on the feed tab shows one more unread within a few seconds

#### Scenario: A notification while the inbox is open

- **WHEN** a member has the inbox open in a PowerSync build and a notification aimed at them arrives
- **THEN** it joins the top of the inbox, marked unread, within a few seconds

#### Scenario: A notification while hidden

- **WHEN** a notification aimed at the member arrives while their app is hidden, and they show it again before the time away counts as stale
- **THEN** nothing is fetched while hidden, and the unread count is fetched once on return

### Requirement: Opening the inbox shows what was unread and clears the count in either build

Opening the inbox SHALL show the notifications that were unread as new on that visit and SHALL mark them read on the server, also when the member leaves before the inbox has shown them. The unread count SHALL no longer count them by the time the member is back on a screen in the app that shows it; one that arrives while the inbox is open stays unread until the next visit.

#### Scenario: Opening the inbox

- **WHEN** a member with unread notifications opens the inbox in a PowerSync build
- **THEN** those notifications show as new on that visit, and they are read on the server

#### Scenario: Back from the inbox

- **WHEN** a member opens the inbox in a PowerSync build and goes back to the feed
- **THEN** the bell shows no unread, and on the explore map neither does the feed tab

#### Scenario: Leaving before the inbox shows

- **WHEN** a member opens the inbox and goes back before its notifications have loaded
- **THEN** the notifications are read on the server all the same
