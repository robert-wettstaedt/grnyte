# Spec Delta

## ADDED Requirements

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

## REMOVED Requirements

### Requirement: The owner can hand ownership to another admin

**Reason**: The handover was confirmed with the owner's password, which an account without one cannot give. It is now confirmed by a re-authentication bound to the session, the region and the recipient, and the previous owner is mailed.

**Migration**: See "The owner can hand ownership to another admin after re-authenticating" in this spec and `auth/reauthentication`. A tab loaded before the deploy that submits a password is refused with "reload this page".
