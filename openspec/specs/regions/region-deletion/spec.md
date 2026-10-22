# region-deletion Specification

## Purpose

The owner of a region can delete it, together with everything in it, after seeing what it holds and confirming twice. The other members learn about it by email.

## Requirements

### Requirement: Only the owner can delete a region

Deleting a region SHALL be available to its owner and to nobody else, app admins included. The region settings SHALL show a "Delete region" entry to the owner only.

#### Scenario: Owner sees the entry

- **WHEN** the owner opens the region settings
- **THEN** a "Delete region" entry is shown at the bottom

#### Scenario: Other admin

- **WHEN** an admin who is not the owner opens the region settings, or opens the deletion screen directly
- **THEN** no "Delete region" entry is shown, the screen refuses, and a submitted deletion is refused with no data changed

### Requirement: The deletion screen shows what will be removed

Before asking for confirmation, the deletion screen SHALL state how many other active members will lose access, and how many ascents those members logged in the region. The counts SHALL come from the server, not from a partly synced client.

#### Scenario: Region with other members' ascents

- **WHEN** the owner opens the deletion screen of a region where two other members logged ascents
- **THEN** the screen states those ascents and that two members lose access, and the deletion cannot be submitted until it has

### Requirement: Deletion takes the password and the region's name

The deletion SHALL proceed only when the owner enters their correct password and types the region's name exactly as shown. Surrounding spaces SHALL be ignored. Either mismatch SHALL change nothing and SHALL mark the field that is wrong.

#### Scenario: Wrong name

- **WHEN** the owner types a name that differs from the region's name
- **THEN** nothing is deleted and the name field shows the error

#### Scenario: Wrong password

- **WHEN** the owner types the right name and a wrong password
- **THEN** nothing is deleted and the password field shows the error

### Requirement: A deleted region is gone whole and at once

A confirmed deletion SHALL remove the region and everything that belongs to it, immediately and with no restore, including the stored image and video files. People outside the region SHALL keep their profiles.

#### Scenario: Confirmed deletion

- **WHEN** the owner confirms the deletion
- **THEN** its sectors, blocks, routes, topos, ascents (every member's), comments, reactions, feed events, notifications, memberships, invitations and files are gone, the stored files are removed, and the owner lands on settings with one founding slot freed

#### Scenario: A first ascensionist linked to a profile

- **WHEN** a person's profile is linked to one of the region's first ascensionists
- **THEN** the profile stays and loses only that link

#### Scenario: Pending invitation

- **WHEN** someone opens an invitation link to the deleted region
- **THEN** they see the existing invalid-invitation state

#### Scenario: Member with the region open

- **WHEN** another member has the region open while it is deleted
- **THEN** the region disappears from their app and its screens show the existing not-found state

### Requirement: Other members are told by email

After a deletion commits, every other person who was an active member SHALL receive one email in their contact language. The email SHALL name the region and say that its owner deleted it. A failed send SHALL be logged and SHALL NOT undo or block the deletion.

#### Scenario: Three other members

- **WHEN** the owner deletes a region with three other active members
- **THEN** each of the three gets one email in their own language, and the owner gets none

#### Scenario: Mail provider fails

- **WHEN** a send fails
- **THEN** the region stays deleted and the failure is logged
