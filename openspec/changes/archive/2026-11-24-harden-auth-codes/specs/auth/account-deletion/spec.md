# Spec Delta

## ADDED Requirements

### Requirement: Deletion is confirmed by re-authentication

Deletion SHALL proceed only after the person re-authenticates for deleting their account, in the same session, within the confirmation's lifetime. The deletion screen SHALL ask for the mailed code, or another confirmer where the account has one, and SHALL NOT ask for the password. A wrong or expired code SHALL refuse the deletion with an error on the code field and change nothing.

#### Scenario: Correct code

- **WHEN** the person enters the code mailed for deleting their account and confirms
- **THEN** the account is deleted

#### Scenario: Wrong code

- **WHEN** the person enters a code that is not the current one
- **THEN** the code field shows an error and no data changes

#### Scenario: Account without a password

- **WHEN** a person whose account has no password deletes it
- **THEN** the code alone confirms the deletion

## MODIFIED Requirements

### Requirement: Deletion is immediate and final

A confirmed deletion SHALL take effect at once, with no grace period and no way to undo it. Afterwards the person SHALL be signed out on that device, and no session of theirs on any device SHALL read or write anything as them. Every session of the account SHALL end in the same step that removes its data.

#### Scenario: After deleting

- **WHEN** the deletion succeeds
- **THEN** the person lands signed out on the landing page with a confirmation that the account is gone

#### Scenario: Another signed-in device

- **WHEN** a second device still holds a session for the deleted account
- **THEN** it can no longer read region data or write anything, and signing in with the old email and password fails

### Requirement: The owner of a shared region cannot delete their account

Deletion SHALL be refused while the person owns a region that has at least one other active member, whether or not that region has other admins. The refusal SHALL name every such region and ask the person to hand ownership over first. It SHALL change nothing, and SHALL NOT spend the person's re-authentication.

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
- **THEN** the screen names the region before any code is requested

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
- **THEN** the person still sees the deletion as done, the leftover sign-in record gives access to nothing and cannot start a new profile, and it is removed on a later retry

## REMOVED Requirements

### Requirement: Deletion is confirmed with the current password

**Reason**: A password cannot confirm anything for an account that has none, and the password check is replaced by a code bound to the account, the session and the action.

**Migration**: See "Deletion is confirmed by re-authentication" in this spec and `auth/reauthentication`. A tab loaded before the deploy that submits a password is refused with "reload this page".
