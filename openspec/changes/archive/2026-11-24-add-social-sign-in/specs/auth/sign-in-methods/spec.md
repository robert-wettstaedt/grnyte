# Spec Delta

## Purpose

Lets a person see every way they can sign in to their account, add or remove Apple and Google, and set a first password, so losing one way in never locks them out.

## ADDED Requirements

### Requirement: Settings list the account's sign-in methods

A signed-in person SHALL find a "Sign-in methods" screen in settings listing their password (set or not set), Apple and Google, each as linked or not linked in a status line under its name, followed by "Sign out other devices" and the list of signed-in devices (`auth/sessions`). It SHALL NOT prompt them to add a method. A completed add or remove SHALL be confirmed in text, naming the provider.

#### Scenario: Google-only account

- **WHEN** a person whose account has only Google opens the screen
- **THEN** it shows Google as linked, Apple as not linked and the password as not set, with no prompt to add one

#### Scenario: Signing out other devices from here

- **WHEN** a person opens the screen
- **THEN** "Sign out other devices" is offered below the methods and acts at once when pressed, with no re-authentication

### Requirement: Linking a provider needs re-authentication

Adding Apple or Google SHALL require a fresh re-authentication for adding that provider, and SHALL then complete a sign-in at that provider. A link attempt without one SHALL change nothing, also when asked of the authentication service directly.

#### Scenario: Adding Google

- **WHEN** a person presses "Add" next to Google, enters the mailed code, and approves at Google
- **THEN** Google is listed as linked and their next "Continue with Google" signs in to this account

#### Scenario: Without re-authentication

- **WHEN** a link is attempted with no confirmation for adding that provider
- **THEN** nothing is linked and the person is asked to confirm first

### Requirement: An identity already on another account cannot be linked

When the provider identity is already linked to a different grnyte account, the link SHALL be refused with a message saying to sign in to that account and delete it or remove the provider there first.

#### Scenario: Second account with the same Apple ID

- **WHEN** a person tries to add an Apple ID that already signs in to another grnyte account
- **THEN** nothing is linked and the screen says to sign in there and delete that account or remove Apple from it first

### Requirement: A provider address that belongs to another account cannot be linked

When the provider's email address is the address of a different grnyte account, the link SHALL be refused and nothing linked.

#### Scenario: Partner's Google account

- **WHEN** a person tries to add a Google account whose address is another grnyte account's address
- **THEN** the link is refused and both accounts are unchanged

### Requirement: Unlinking needs re-authentication and leaves a way in

Removing Apple or Google SHALL require a fresh re-authentication for removing that provider. It SHALL be refused when afterwards the account would have neither a password nor another provider, or when it is the account's only identity at the authentication service, and the screen SHALL say why.

#### Scenario: Removing the last method

- **WHEN** a person whose only way in is Google looks at the Google row
- **THEN** removal is not offered, and the row says to set a password or add another method first

#### Scenario: Removing Google with a password set

- **WHEN** a person with a password and `ana@example.org` as address confirms and removes Google
- **THEN** Google is no longer listed, and a later "Continue with Google" is refused as for any confirmed account without Google

#### Scenario: Removing Google from a Gmail address

- **WHEN** a person whose address is `ana@gmail.com` removes Google and later continues with Google as `ana@gmail.com`
- **THEN** the Remove step said they can still sign in with Google because Google manages the address, and Google is linked to the account again

### Requirement: Unlinking signs other devices out

A successful unlink SHALL end every other session of the account and keep the session that made it. A link SHALL NOT end any session.

#### Scenario: Removing Google on the laptop

- **WHEN** a person signed in on a laptop and a phone removes Google on the laptop
- **THEN** the phone's next change or account action is refused as signed out, the laptop stays signed in, and the confirmation says other devices were signed out

#### Scenario: Adding Apple

- **WHEN** a person links Apple on the laptop
- **THEN** the phone stays signed in

#### Scenario: A password set on a social-only account

- **WHEN** a Google-only person sets a first password, in settings or through a password reset
- **THEN** removing Google is offered, since the account now has a second identity and a password

### Requirement: Removing Apple revokes grnyte's Apple authorization

Removing Apple SHALL offer "Confirm with Apple" first. When the person confirms with Apple, grnyte SHALL revoke its authorization at Apple before Apple is removed, storing nothing from Apple. When they confirm with the mailed code instead, Apple SHALL still be removed and the missed revocation recorded; a revocation made for another action SHALL NOT count for this one.

#### Scenario: Remove Apple through Apple

- **WHEN** a person confirms with Apple and removes Apple
- **THEN** Apple is unlinked and grnyte no longer appears as connected in their Apple ID settings

### Requirement: An account without a password can set one

An account with no password SHALL be offered "Set a password", which sets a first password through the same re-authentication and password rules as a change.

#### Scenario: Setting a first password

- **WHEN** a Google-only person chooses "Set a password", confirms and enters a new password
- **THEN** they can sign in with their address and that password, and the screen shows the password as set

### Requirement: Link and unlink are recorded

Each link and unlink SHALL be recorded in the auth event log with the provider, and each refused link with its reason, without addresses.

#### Scenario: Refused link

- **WHEN** a link is refused because the identity is on another account
- **THEN** the event log holds that refusal with the provider and no address
