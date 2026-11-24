# auth/security-notices Specification

## Purpose
Tells a person by mail when something important happens to their account, or when someone tries to use their address, so an unwanted change is noticed.

## Requirements

### Requirement: An existing address gets a notice instead of a second account

A sign-up with an address that already has a confirmed account SHALL create nothing and SHALL mail that address an "already have an account" notice. The notice SHALL list the account's sign-in methods and point to forgot password for adding or recovering a password. The screen SHALL answer as for a new address.

#### Scenario: Signing up twice

- **WHEN** someone signs up with an address whose account is confirmed
- **THEN** the screen asks for a code as usual, no code is sent, and the address receives the notice naming its sign-in methods

### Requirement: The account is told when its password or email changes

A password change, including the first password set on an account, and an email change SHALL each send a notice to the account's address. An email change SHALL notify the old address.

#### Scenario: First password

- **WHEN** a person sets a password on an account that had none
- **THEN** the address receives a "your password changed" notice

#### Scenario: Email changed

- **WHEN** the account's address changes
- **THEN** the old address receives a notice

### Requirement: Account deletion and ownership handover are confirmed by mail

Deleting an account SHALL mail the deleted account's address a confirmation. Handing over a region's ownership SHALL mail the previous owner a confirmation naming the region and the new owner. A failed send SHALL be logged and SHALL NOT undo or block the action.

#### Scenario: Account deleted

- **WHEN** a person deletes their account
- **THEN** their address receives one mail confirming the deletion

#### Scenario: Ownership handed over

- **WHEN** an owner hands a region over
- **THEN** they receive a mail naming the region and the new owner

### Requirement: Notices name the way back

Each notice grnyte mails itself SHALL be in the account's contact language and SHALL end with a "this was not me" line naming the account's actual sign-in methods. A notice sent by the authentication service SHALL end with a line that holds for every account.

#### Scenario: Not me

- **WHEN** a person who did not change their password reads the notice
- **THEN** it tells them how to get back in with the sign-in methods their account has

### Requirement: Linking or unlinking a provider sends a notice

Adding or removing Apple or Google on an account SHALL mail a notice to the account's address naming the provider, however the change was made.

#### Scenario: Google added

- **WHEN** Google is linked to an account
- **THEN** the account's address receives a notice that Google can now sign in to it

#### Scenario: Apple removed

- **WHEN** Apple is unlinked from an account
- **THEN** the account's address receives a notice that Apple can no longer sign in to it
