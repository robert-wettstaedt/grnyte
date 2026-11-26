# sync/server-reads Specification

## Purpose

How a client reads data its device does not hold, such as the feed while it is not synced, and which rules decide what the app server answers.

## Requirements

### Requirement: A read the device does not hold is answered by the app server

In a build that runs PowerSync, a read with no synced copy on the device SHALL be answered by the app server, with the rows, in the shape, that the sync engine's query for that read gives the same caller, less any row that row-level security refuses that caller.

#### Scenario: The "last edited" line

- **WHEN** a member opens a route page in a PowerSync build
- **THEN** the line shows the route's latest event, read from the app server, and reads as it does in a Zero build

#### Scenario: The feed

- **WHEN** a member opens the feed in a PowerSync build and in a Zero build over the same data
- **THEN** both show the same cards

### Requirement: The app server answers a read under the caller's own access

The app server SHALL run a read for the signed-in caller only, with that caller's region memberships and under row-level security as that caller. It SHALL refuse a read when the caller's memberships could not be loaded.

#### Scenario: A region the caller does not belong to

- **WHEN** a member asks for the events of a region they are not a member of
- **THEN** the answer holds none of that region's events

#### Scenario: A membership without read access

- **WHEN** a caller whose role in a region does not allow reading it asks for that region's events
- **THEN** the answer holds none of them

#### Scenario: No live session

- **WHEN** a request without a live session asks for a read
- **THEN** it is refused

#### Scenario: Another account in the same browser

- **WHEN** a screen of one account asks for a read after another account signed in to the same browser
- **THEN** the read is refused, and the screen never shows the other account's rows as its own

#### Scenario: Memberships unreadable

- **WHEN** the caller's memberships cannot be loaded
- **THEN** the read is refused, never answered without a region filter

### Requirement: A server read says only what it knows

A screen SHALL treat a server read as answered only once the app server has answered that exact read. Until then it SHALL show loading, or the rows already on screen when the new read only moves the window of the same list, and never an empty result. Offline, a server read that has no answer yet SHALL show as unavailable, not as an error.

#### Scenario: Changing the filter

- **WHEN** a reader switches the feed from all activity to ascents
- **THEN** the feed shows loading until the new answer arrives, and never an empty state left over from the previous answer

#### Scenario: Loading older entries

- **WHEN** a reader loads older feed entries
- **THEN** the entries on screen stay in place while the older ones are fetched

#### Scenario: Opening the inbox offline

- **WHEN** a member opens the inbox in a PowerSync build while the device is offline
- **THEN** the inbox says it needs a connection

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
