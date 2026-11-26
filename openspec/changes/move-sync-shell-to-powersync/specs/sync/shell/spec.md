# Spec Delta

## Purpose

What the shell of a PowerSync build tells the reader about the connection, the local database and the session, and what it does when the account changes under an open tab.

## ADDED Requirements

### Requirement: PowerSync alone decides the connection state in its build

In a build that runs PowerSync, the online flag and the status bar SHALL take the sync connection from PowerSync and from no other engine, beside the browser's flag and the reachability probe. A connection short of connected SHALL read as reconnecting, and as offline once it has lasted 10 seconds on a visible page, at a launch too. It SHALL NOT read as a state only a reload leaves, except for the stalled catch-up after a return.

#### Scenario: The sync service goes away

- **WHEN** PowerSync loses its connection and has none for 10 seconds on a visible page
- **THEN** the status bar says the device is offline, and it clears once PowerSync is connected again

#### Scenario: Launched while the sync service is down

- **WHEN** the app opens its database and PowerSync never connects for 10 seconds on a visible page
- **THEN** the status bar says the device is offline

#### Scenario: The Zero client fails

- **WHEN** the Zero client a PowerSync build still starts loses its connection or is refused, and PowerSync stays connected
- **THEN** the status bar shows nothing and the app stays online

#### Scenario: Signal lost with a connection that has not noticed

- **WHEN** the browser reports offline and PowerSync reports another status on the connection it still holds, with no newer checkpoint
- **THEN** the app stays offline

#### Scenario: A Zero build

- **WHEN** the app is built with Zero
- **THEN** the connection state and the sign-in recovery come from Zero's connection

### Requirement: A tab whose sync another tab holds is not called offline

In a build that runs PowerSync, while another tab of the same account holds the sync, a tab without a connection SHALL read as reconnecting, and only the browser's flag and the probe SHALL make it offline.

#### Scenario: Another tab holds the sync

- **WHEN** a second tab has opened its database and stays unconnected because a frozen first tab holds the sync, on a working network
- **THEN** it says reconnecting, and a write from it is sent

### Requirement: A tab that cannot open the local database says so

In a build that runs PowerSync, a tab whose local database is not open after 3 seconds, while it waits for a lock on that database another tab holds, SHALL say that the app is open in another tab. The message SHALL rank above every offline and nothing-downloaded message and SHALL go by itself once the database opens. A slow opening with no such lock SHALL NOT show it. Until the database is open, the tab SHALL claim nothing about the connection on PowerSync's word.

#### Scenario: Two tabs on an iPhone

- **WHEN** a second tab waits for the lock the first tab holds
- **THEN** after 3 seconds it names the other tab and offers a reload, not a spinner and not "nothing downloaded"

#### Scenario: The first tab closes

- **WHEN** the tab that holds the lock is closed while the message shows
- **THEN** the second tab opens its database and shows its screen without a reload

#### Scenario: A slow phone with one tab

- **WHEN** the database takes 6 seconds to open and no other tab holds its lock
- **THEN** the message never shows

### Requirement: A device whose session ended clears itself

In a build that runs PowerSync, a write refused as unauthorized SHALL ask the authentication service for a new token once before it is sent again. When the service answers that the session or its refresh token is gone, and no newer token of the same account is stored, the device SHALL sign out, clear its data and go to the start page. Any other failure of the refresh SHALL sign nobody out. A server read refused because the session ended SHALL clear the device too.

#### Scenario: Signed out elsewhere, then a write

- **WHEN** another device ended this session and the member saves a favorite here
- **THEN** the write is refused, and the device clears its data and goes to the start page

#### Scenario: The authentication service is down

- **WHEN** a write is refused as unauthorized and the refresh fails with a server error, a rate limit or no network
- **THEN** the write is reported as failed and the device stays signed in

#### Scenario: Another tab renewed the token

- **WHEN** the refresh is refused as already used and storage holds a newer token of this account
- **THEN** the write is sent with that token and the device stays signed in

#### Scenario: Another account is stored

- **WHEN** a write is refused as unauthorized and storage holds another account's session
- **THEN** that session is neither refreshed nor signed out

#### Scenario: Signed out elsewhere, then a server read

- **WHEN** another device ended this session and the feed asks the app server
- **THEN** the device clears its data and goes to the start page, with no error text shown

### Requirement: A tab that lost its stored session clears the device

In a build that runs PowerSync, a tab that started signed in and finds no stored session at a write, at a server read refused as unauthenticated or when its session is read again SHALL clear the device and go to the start page; a session that could not be read SHALL NOT.

#### Scenario: Another tab already cleared the sign-in

- **WHEN** one tab's refusal cleared the cookie, and a second tab then saves a favorite or asks for the feed
- **THEN** the second tab clears the device and goes to the start page

### Requirement: An account switch ends in the reload alone

In a build that runs PowerSync, a tab that finds another account signed in SHALL clear its own account's database and reload at its own URL. Until the reload, its screens SHALL NOT receive the new session, no error of theirs SHALL be logged, and no redirect SHALL replace the reload.

#### Scenario: Sign-out in a second tab

- **WHEN** the second tab signs out on the invitation page while the first tab runs
- **THEN** the first tab clears the device and goes to the start page, as after a sign-out in the browser

#### Scenario: Switch in a second tab that the first tab did not hear

- **WHEN** the first tab missed the second tab's sign-out (it was frozen), the second tab signed in as another account, and the first tab is shown again
- **THEN** the first tab reloads at its own URL, its account's database is gone, and the error log gains no entry

#### Scenario: The stored session cannot be read

- **WHEN** the token expired, the authentication service cannot be reached, and the member leaves the app's screens for a legal page and comes back
- **THEN** the screens show again with this document's account, nothing hangs or reloads its data over and over, and its database stays

#### Scenario: On the explore map while the store empties

- **WHEN** the switch finds the first tab on a screen that sends a member without regions to region creation
- **THEN** it reloads at its own URL and opens neither region creation nor profile completion
