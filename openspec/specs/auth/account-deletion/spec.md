# account-deletion Specification

## Purpose

Lets a signed-in person delete their own grnyte account from inside the app, and fixes what happens to every kind of data they leave behind, so shared guidebook content survives without them.

## Requirements

### Requirement: A person can delete their own account

A signed-in person SHALL be able to delete their account from a dedicated screen at `/settings/account/delete`, reachable from the settings screen. The screen SHALL state what is deleted and what stays anonymised before the person confirms.

#### Scenario: Reaching the screen

- **WHEN** a signed-in person opens settings
- **THEN** a row leads to `/settings/account/delete`

#### Scenario: Signed out

- **WHEN** someone who is not signed in opens `/settings/account/delete`
- **THEN** they are sent to sign in, as for any other settings screen

### Requirement: Deletion is confirmed with the current password

Deletion SHALL proceed only when the submitted password is the account's current password. A wrong password SHALL refuse the deletion with a field error on the password and change nothing.

#### Scenario: Correct password

- **WHEN** the person submits their current password
- **THEN** the account is deleted

#### Scenario: Wrong password

- **WHEN** the person submits a password that is not their current one
- **THEN** the password field shows an error and no data changes

### Requirement: Deletion is immediate and final

A confirmed deletion SHALL take effect at once, with no grace period and no way to undo it. Afterwards the person SHALL be signed out on that device, and no session of theirs on any device SHALL read or write anything as them.

#### Scenario: After deleting

- **WHEN** the deletion succeeds
- **THEN** the person lands signed out on the landing page with a confirmation that the account is gone

#### Scenario: Another signed-in device

- **WHEN** a second device still holds a session for the deleted account
- **THEN** it can no longer read region data or write anything, and signing in with the old email and password fails

### Requirement: The owner of a shared region cannot delete their account

Deletion SHALL be refused while the person owns a region that has at least one other active member, whether or not that region has other admins. The refusal SHALL name every such region and ask the person to hand ownership over first. It SHALL change nothing.

#### Scenario: Only admin of a region with members

- **WHEN** the person owns a region with other active members, as its only admin, and submits the deletion
- **THEN** the deletion is refused, the screen lists that region with a prompt to hand it over, and no data changes

#### Scenario: Another admin exists

- **WHEN** the person owns a region that has a second active admin
- **THEN** the region still blocks the deletion until ownership is handed over

#### Scenario: Admin who is not the owner

- **WHEN** the person is an admin, but not the owner, of a region with other active members
- **THEN** the region does not block the deletion

#### Scenario: Shown before submitting

- **WHEN** the person opens the deletion screen while a region would block it
- **THEN** the screen names the region before they enter their password

### Requirement: A region left with no other members is deleted whole

When the person is the only active member of a region, deleting their account SHALL delete that region with all of its areas, blocks, routes, topos, comments, reactions, events and files, including the stored image and video files.

#### Scenario: Sole member

- **WHEN** the person is the only active member of a region and deletes their account
- **THEN** the region and everything in it is gone, and its files are removed from storage

#### Scenario: Inactive members do not count

- **WHEN** a region's only other members are inactive
- **THEN** the region is treated as having no other members and is deleted

### Requirement: Guidebook contributions in shared regions stay without their author

In a region that keeps other active members, the person's areas, blocks, routes, topos, media on those, comments, emoji reactions and change history SHALL remain, with no link to the deleted account. So SHALL the feed events they caused, with their comments, and the notifications those sent to other members. Anywhere the app would show their name it SHALL show "Deleted user", with a neutral avatar.

#### Scenario: A route they created

- **WHEN** the person created a route in a shared region and deletes their account
- **THEN** the route remains, and its author shows as "Deleted user"

#### Scenario: A comment thread they started

- **WHEN** the person wrote the first comment of a thread that has replies
- **THEN** the comment and every reply remain, and the first comment's author shows as "Deleted user"

#### Scenario: A route they edited, with comments

- **WHEN** the person edited a route in a shared region and others commented on that feed card
- **THEN** the card, its comments and its change history remain, with the actor shown as "Deleted user"

#### Scenario: A role they changed, in the feed

- **WHEN** the person changed another member's role
- **THEN** that card remains, credited to "Deleted user"

#### Scenario: An invitation they sent, in the feed

- **WHEN** the person invited someone by email
- **THEN** the invite card goes with the account, as the invitation itself does

#### Scenario: Their profile

- **WHEN** someone opens the deleted person's former profile URL
- **THEN** the app answers that the profile does not exist

#### Scenario: A mention of them

- **WHEN** a description or comment mentions the deleted person
- **THEN** the mention renders as a removed reference, not as their old name

### Requirement: Their own climbing log is deleted

The person's ascents and every file attached to an ascent SHALL be deleted, including stored files. Route grade and rating averages that included their ascents SHALL be recomputed from the remaining ones.

#### Scenario: An ascent with a video

- **WHEN** the person logged an ascent with an attached video and deletes their account
- **THEN** the ascent is gone and the video is removed from storage

#### Scenario: A route's community grade

- **WHEN** the person's ascent was one of the votes behind a route's community grade
- **THEN** the route's community grade and rating reflect only the remaining votes

### Requirement: Personal records are deleted

Deleting an account SHALL delete the person's favorites, settings, push subscriptions, app roles, region memberships, the notifications addressed to them, the feed events and notifications in which they are the subject, and the invitations they sent.

#### Scenario: A feed event about them

- **WHEN** a feed event says the person joined a region
- **THEN** that event and its comments are gone from every feed

#### Scenario: An ascent's card

- **WHEN** the person logged an ascent that others commented on
- **THEN** the ascent, its card and those comments are gone

#### Scenario: A pending invitation they sent

- **WHEN** the person invited someone who has not accepted yet
- **THEN** the invitation no longer works

### Requirement: References to them elsewhere are unlinked

Records that only point at the person SHALL lose the link and keep the rest: first ascensionist entries keep their name as plain text, memberships lose their inviter, and feedback they sent stays without its author for the retention period the privacy policy names.

#### Scenario: A first ascent credited to them

- **WHEN** a route credits the person as its first ascensionist through their profile
- **THEN** the route still credits the same name, with no link to a profile

#### Scenario: Someone they invited

- **WHEN** the person invited a member who accepted
- **THEN** that member stays in the region and nothing names an inviter

### Requirement: A failed deletion leaves the account whole

If any part of removing the account's data fails, no data SHALL be removed and the person SHALL see a generic failure they can retry. Removing stored files SHALL happen only after the data is gone, and a file that fails to delete SHALL NOT bring the account back.

#### Scenario: The data step fails

- **WHEN** removing the account's data fails partway
- **THEN** every row is as it was and the screen offers a retry

#### Scenario: Storage cleanup fails

- **WHEN** the data is removed but deleting a stored file fails
- **THEN** the account stays deleted and the leftover file is reported for cleanup

#### Scenario: Removing the sign-in record fails

- **WHEN** the data is removed but removing the sign-in record fails
- **THEN** the person still sees the deletion as done, the leftover sign-in record gives access to nothing, and it is removed on a later retry
