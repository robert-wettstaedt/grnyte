# region-ownership Specification

## Purpose

Every region has exactly one owner among its active admins. The owner alone can delete the region or hand it to someone else, and no other admin can take that role away.

## Requirements

### Requirement: Every region with active members has one owner

A region SHALL have exactly one owner, the person who founded it unless ownership has been handed over. Whenever the region has active members, the owner SHALL be one of its active admins. The region screen SHALL show the owner under the label "Owner".

#### Scenario: Founding a region

- **WHEN** a person founds a region
- **THEN** they are its owner and an admin

#### Scenario: Region screen

- **WHEN** a member opens the region screen
- **THEN** it names the owner under "Owner"

### Requirement: Other admins cannot take the owner's place

No member SHALL demote the owner or remove the owner from the region. The owner SHALL NOT leave the region or change their own role while they own it. Each refusal SHALL change nothing and SHALL tell the person to hand ownership over first.

#### Scenario: Admin tries to demote the owner

- **WHEN** an admin changes the owner's role to maintainer or member
- **THEN** the change is refused and the owner stays an admin

#### Scenario: Admin tries to remove the owner

- **WHEN** an admin removes the owner from the region
- **THEN** the removal is refused and the owner stays a member

#### Scenario: Owner tries to leave

- **WHEN** the owner leaves the region
- **THEN** leaving is refused with a prompt to hand ownership over first

#### Scenario: Removing a non-owner admin

- **WHEN** an admin removes, demotes or lets leave another admin who is not the owner, even the last admin besides the owner
- **THEN** the change proceeds, because the owner remains an admin

### Requirement: The owner can hand ownership to another admin

The owner SHALL be able to make another active admin of the region its owner, after re-entering their own password. The previous owner SHALL stay an admin. The new owner SHALL receive the role-change notice, saying they are now the owner. The handover SHALL be refused when the recipient already owns the maximum number of regions one account may found. Only the current owner SHALL be able to hand over.

#### Scenario: Handover to an admin

- **WHEN** the owner chooses "Make owner" on an active admin and enters the correct password
- **THEN** that admin is the owner, the previous owner is still an admin, and the new owner is notified

#### Scenario: Wrong password

- **WHEN** the owner enters a wrong password
- **THEN** nothing changes and the password field shows the error

#### Scenario: Recipient is not an admin

- **WHEN** the handover names a maintainer, a member, or someone who is not an active member
- **THEN** it is refused and nothing changes

#### Scenario: Recipient at the founding cap

- **WHEN** the recipient already owns the maximum number of regions
- **THEN** the handover is refused with that reason and nothing changes

#### Scenario: Non-owner attempts a handover

- **WHEN** an admin who is not the owner submits a handover
- **THEN** it is refused and nothing changes
