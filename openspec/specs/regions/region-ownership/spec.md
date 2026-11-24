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

### Requirement: The owner can hand ownership to another admin after re-authenticating

Only the current owner SHALL be able to make another active admin the owner, after re-authenticating in the same session for handing this region to that admin. The previous owner SHALL stay an admin and be mailed a confirmation; the new owner SHALL get the role-change notice. A recipient at the founding cap SHALL be refused. A refusal SHALL NOT spend the re-authentication.

#### Scenario: Handover to an admin

- **WHEN** the owner chooses "Make owner" on an active admin, enters the correct code and then confirms the handover
- **THEN** that admin is the owner, the previous owner is still an admin and receives the confirmation mail, and the new owner is notified

#### Scenario: Wrong code

- **WHEN** the owner enters a wrong code
- **THEN** nothing changes and the code field shows the error

#### Scenario: Code for another admin

- **WHEN** the owner re-authenticated for handing the region to one admin and submits a handover to another
- **THEN** nothing changes and a new code is asked for

#### Scenario: Recipient is not an admin

- **WHEN** the handover names a maintainer, a member, or someone who is not an active member
- **THEN** it is refused and nothing changes

#### Scenario: Recipient at the founding cap

- **WHEN** the recipient already owns the maximum number of regions
- **THEN** the handover is refused with that reason and nothing changes

#### Scenario: Non-owner attempts a handover

- **WHEN** an admin who is not the owner submits a handover
- **THEN** it is refused and nothing changes
