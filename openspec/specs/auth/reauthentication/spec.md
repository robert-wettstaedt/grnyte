# auth/reauthentication Specification

## Purpose
Makes a person prove again that they control their account before an action that cannot be undone or that hands the account to someone else, without needing a password, and holds the authentication service's own endpoints to the same rule.

## Requirements

### Requirement: Sensitive actions require a fresh re-authentication

Deleting the account, deleting a region, handing over a region's ownership, and changing or setting the password SHALL each proceed only after the person re-authenticates for that action. None of them SHALL accept the current password as confirmation. Signing out other devices, from settings or after a password change, a password reset or an email change, SHALL NOT ask for one.

#### Scenario: Deleting the account

- **WHEN** a person asks to delete their account
- **THEN** they are asked for a code mailed to their address before anything is deleted

#### Scenario: Signing out other devices

- **WHEN** a person presses "Sign out other devices" in settings
- **THEN** the other sessions end at once, with no code asked

#### Scenario: Automatic sign-out after a reset

- **WHEN** a person completes a password reset
- **THEN** their other devices are signed out with no re-authentication asked

#### Scenario: Old password-only request

- **WHEN** a request to one of these actions carries a password and no re-authentication
- **THEN** it is refused with a "reload this page" message and nothing changes

### Requirement: The re-authentication code is grnyte's own

The code SHALL be 6 random digits from a cryptographic source, mailed by grnyte to the account's current address, stored only in a form that does not reveal it, valid for 10 minutes, and usable once. Requesting a new code SHALL void the previous one for the same action and target. An account SHALL receive at most 5 re-authentication mails per hour.

#### Scenario: Requesting a second code

- **WHEN** a person requests a code, then requests another for the same action
- **THEN** only the second code works

#### Scenario: Sixth mail in an hour

- **WHEN** a person requests a sixth re-authentication code within an hour
- **THEN** no mail is sent and the screen says to try again later

### Requirement: Five wrong tries void the code

A code SHALL be void after 5 wrong entries, including the fifth, and the person SHALL have to request a new one. Each wrong entry SHALL be recorded in the auth event log.

#### Scenario: Guessing

- **WHEN** someone enters 5 wrong codes and then the right one
- **THEN** the right one is refused as void, and a new code must be requested

### Requirement: A code is bound to one account, session, action and target

A code SHALL confirm only the action and target it was requested for, only for the account and the signed-in session that requested it. Entering it anywhere else SHALL fail as a wrong code.

#### Scenario: Code for another region

- **WHEN** a person requests a code to delete region A and enters it on the deletion screen of region B
- **THEN** it is refused and region B is not deleted

#### Scenario: Code on another device

- **WHEN** a code requested from one signed-in device is entered on another device of the same account
- **THEN** it is refused

### Requirement: A confirmation is checked where the action runs

A correct code SHALL produce a confirmation that lasts 5 minutes and is spent by the first action that uses it. The action SHALL check, in the same step that performs it, that an unspent confirmation exists for exactly its account, session, action and target. A confirmation for a different action or target SHALL NOT count.

#### Scenario: Acting within 5 minutes

- **WHEN** a person confirms a code and then submits the deletion within 5 minutes
- **THEN** the deletion proceeds and the confirmation is spent

#### Scenario: Acting twice

- **WHEN** the same confirmation is used for a second deletion
- **THEN** the second is refused and asks for a new code

#### Scenario: Acting late

- **WHEN** a person confirms a code and submits the action 6 minutes later
- **THEN** the action is refused and asks for a new code

#### Scenario: Failed action

- **WHEN** an action is refused for a reason of its own, such as a region blocking account deletion
- **THEN** the confirmation is not spent

### Requirement: Other confirmers can stand in for the code

The code SHALL be one way to produce a confirmation, not the only one. A confirmation produced another way SHALL be bound to the same account, session, action and target, SHALL last the same 5 minutes, and SHALL be checked by the action exactly as a code's is. The code screen SHALL have room for another way to confirm next to the code field.

#### Scenario: A confirmation from another confirmer

- **WHEN** a confirmation for deleting the account is produced by another confirmer for this session
- **THEN** account deletion accepts it as it would a code's

### Requirement: A confirmation never runs the action by itself

Every re-authentication screen SHALL confirm first: a correct code, or an existing confirmation, SHALL only mark the screen confirmed, reveal the screen's own fields where it has any (the new password, the region's name), and enable the action. The action SHALL run only when the person submits it, and its progress SHALL show on that submit control. A confirmation that expires before the submit SHALL bring the screen back to asking for one, keeping what was typed.

#### Scenario: Correct code on account deletion

- **WHEN** a person enters the correct code on the account deletion screen
- **THEN** the screen reads as confirmed and nothing is deleted until they press Delete

#### Scenario: Correct code on the password screen

- **WHEN** a person enters a correct code on the password change screen
- **THEN** the new-password field appears and no password is changed until they save

### Requirement: A screen that is already confirmed mails no code

A re-authentication screen SHALL first check whether an unspent confirmation for its account, session, action and target exists. When one does, it SHALL show that it is confirmed and offer the action, and SHALL NOT mail a code. When none does, it SHALL mail a code only when the person asks for one or submits the action unconfirmed, never on opening; for an account that can confirm with Apple, submitting unconfirmed SHALL instead offer "Confirm with Apple" and "Send code" again and mail nothing until "Send code" is pressed. A screen that serves several targets on one route SHALL start over for each target.

#### Scenario: Reload within 5 minutes

- **WHEN** a person confirms a code for deleting a region and reloads the deletion screen 2 minutes later
- **THEN** the screen reads as confirmed and no new code is mailed

#### Scenario: Nothing confirmed yet

- **WHEN** a person opens a re-authentication screen with no confirmation for it
- **THEN** no code is mailed, and a "Send code" control shows; pressing it mails a code and shows the code field

#### Scenario: Submitting without a confirmation

- **WHEN** a person without Apple submits account deletion or an ownership handover before confirming, or after the confirmation expired
- **THEN** the action is refused, a code is mailed, the code field shows with a line saying the action needs a confirmation, and after the code the screen reads as confirmed with what was already entered kept; the action runs on the next submit

#### Scenario: Confirmation expired on a screen with its own fields

- **WHEN** a person without Apple submits a new password after the confirmation expired
- **THEN** the change is refused, a code is mailed, and after the code the password field shows again with its value kept; the change runs only on the next submit

#### Scenario: Submitting without a confirmation, Apple-linked

- **WHEN** an Apple-linked person submits account deletion after the confirmation expired
- **THEN** the action is refused, "Confirm with Apple" and "Send code" show with a line saying the action needs a confirmation, no code is mailed, and after a code from there the screen reads as confirmed and the deletion runs when they press Delete

#### Scenario: Blocked account deletion

- **WHEN** a person opens account deletion while a region blocks it
- **THEN** the blocking regions show and no code can be requested

#### Scenario: Next recipient on the same screen

- **WHEN** a person confirmed handing a region to one member and then opens the handover to another member
- **THEN** the screen starts over unconfirmed for the second member

### Requirement: Changing the email or the password voids open confirmations

An email change and a password change, including a reset and a first password, SHALL delete every open re-authentication code and every unspent confirmation of the account, so none issued before the change can be used after it.

#### Scenario: Confirmation from before a password change

- **WHEN** a person confirms a code for deleting their account, then changes their password, then submits the deletion within 5 minutes of the confirmation
- **THEN** the deletion is refused and asks for a new code

#### Scenario: Code mailed before an email change

- **WHEN** a re-authentication code was mailed to the old address and the email change completes before it is entered
- **THEN** the code is refused

### Requirement: Sign-in identities change only after re-authentication

Adding or removing a sign-in identity of an account, or moving one to another account or provider, SHALL be refused at the database, whoever asks, unless the account is being created in that same step, the account's email is not confirmed yet, an unspent confirmation for that change exists for that account, or a requirement below allows the addition. Using a confirmation SHALL spend it. Deleting a whole account SHALL remove its identities without one.

#### Scenario: Direct call with a bare access token

- **WHEN** someone holding only an access token asks the authentication service directly to remove one of the account's sign-in identities
- **THEN** the change is refused and the identity stays

#### Scenario: A new account

- **WHEN** an account is created
- **THEN** its first identity is stored without any confirmation

#### Scenario: Deleting an account

- **WHEN** an account is deleted, by its owner or by the cleanup
- **THEN** its identities go with it

#### Scenario: Moving an identity to another account

- **WHEN** someone asks the database to move an identity to another confirmed account without a confirmation
- **THEN** it is refused

### Requirement: A confirmation for adding names the exact identity

A confirmation for adding an identity SHALL count only after grnyte's own linking flow has named the exact identity it verified, and SHALL then let in that identity and no other.

#### Scenario: Another identity spends a link confirmation

- **WHEN** a person confirmed adding Apple, and a direct request with a stolen session tries to add a different Apple identity
- **THEN** it is refused, because the confirmation names only the identity grnyte's own flow verified

### Requirement: The service's own email identity needs no confirmation

Adding the authentication service's own email identity for the account's current address SHALL be allowed without a confirmation. It opens no sign-in path the password does not already open.

#### Scenario: First password on a social-only account

- **WHEN** an account that signs in only with Google sets its first password, or completes an email change
- **THEN** the authentication service's email identity for the account's address is stored without a further confirmation

#### Scenario: Email identity for another address

- **WHEN** an email identity for an address other than the account's is added without a confirmation
- **THEN** it is refused

### Requirement: A provider may join an address it owns

The database SHALL allow adding an identity without a confirmation when its provider owns the domain of the account's address (Google: `gmail.com`, `googlemail.com`; Apple: `icloud.com`, `me.com`, `mac.com`, `privaterelay.appleid.com`) and the identity's address equals the account's, ignoring case. The list of provider-owned domains SHALL be defined once, in the database, and every other copy SHALL be tested against it.

#### Scenario: Provider-owned address

- **WHEN** a Google identity reporting `ana@gmail.com` is added to the confirmed account `ana@gmail.com` with no confirmation
- **THEN** it is stored

#### Scenario: Provider-owned domain, another address

- **WHEN** a Google identity reporting `bob@gmail.com` is added to the confirmed account `ana@gmail.com` with no confirmation
- **THEN** it is refused

#### Scenario: Address the provider does not own

- **WHEN** a Google identity reporting `ana@example.org` is added to the confirmed account `ana@example.org` with no confirmation
- **THEN** it is refused

### Requirement: Password changes through the authentication service need its own re-authentication

The authentication service SHALL refuse a password change on a session older than 24 hours unless it carries the service's re-authentication proof. grnyte's own password change SHALL rely on its own re-authentication instead and SHALL keep the person signed in on the device they used.

#### Scenario: Old session, direct call

- **WHEN** a session older than 24 hours asks the authentication service directly to change the password
- **THEN** the change is refused

#### Scenario: Changing the password in settings

- **WHEN** a person re-authenticates and sets a new password in settings
- **THEN** the new password works, they stay signed in on this device, and their other devices are signed out

### Requirement: Apple-linked accounts can confirm with Apple

For an account with a linked Apple identity, every re-authentication screen SHALL offer "Confirm with Apple" before any code is mailed, as well as beside the code field once one is. An Apple sign-in that passes the binding rules SHALL produce the same confirmation a correct code does, for the same account, session, action and target. Accounts without Apple SHALL NOT see the option.

#### Scenario: Deleting a region with Apple

- **WHEN** an Apple-linked region owner chooses "Confirm with Apple" on the region deletion screen and approves at Apple
- **THEN** they return to the deletion screen confirmed, no code is mailed, and the deletion proceeds when they submit within 5 minutes

#### Scenario: No Apple identity

- **WHEN** a person with only a password opens a re-authentication screen
- **THEN** only the mailed code is offered

#### Scenario: Blocked account deletion offers no Apple

- **WHEN** an Apple-linked owner of a shared region opens the account deletion screen
- **THEN** neither "Send code" nor "Confirm with Apple" is offered, and Apple is not contacted

#### Scenario: Choosing Apple without a code

- **WHEN** an Apple-linked person opens the account deletion screen and presses "Confirm with Apple" without pressing "Send code"
- **THEN** they go to Apple, no code is mailed, and the deletion does not run until they return confirmed and submit it

### Requirement: An Apple confirmation must be the account's own Apple ID

An Apple confirmation SHALL count only if the Apple identity that signed in is the one linked to this account. Any other Apple ID SHALL be refused, recorded in the auth event log, and produce no confirmation.

#### Scenario: Stolen session, attacker's Apple ID

- **WHEN** someone holding a stolen session chooses "Confirm with Apple" and signs in with their own Apple ID
- **THEN** no confirmation is produced and the attempt is recorded

### Requirement: An Apple confirmation is bound to its action and its session

An Apple confirmation SHALL count only if it completes within 10 minutes of being started, returns in the session that started it, and its identity proof was issued for this confirmation's action and target. A proof issued for another action, another target or another sign-in SHALL produce no confirmation. Apple may complete the confirmation without asking the person anything when the browser already holds an Apple session.

#### Scenario: Proof for another region

- **WHEN** an Apple confirmation started for deleting region A is completed while the request names region B
- **THEN** only a confirmation for region A exists, and deleting region B still asks for confirmation

#### Scenario: Late return

- **WHEN** Apple returns more than 10 minutes after the confirmation was started
- **THEN** no confirmation is produced and the screen offers to try again

#### Scenario: Another session

- **WHEN** an Apple confirmation started in one signed-in session returns in a different session of the same account
- **THEN** no confirmation is produced

### Requirement: Returning from Apple does not mail a code

When a person comes back to a re-authentication screen already confirmed with Apple, the screen SHALL show that it is confirmed and let them perform the action, and SHALL NOT mail a code.

#### Scenario: Back from Apple

- **WHEN** a person returns from "Confirm with Apple" to the account deletion screen
- **THEN** the screen reads as confirmed with the delete button available, and no code mail is sent

### Requirement: Confirm with Apple comes before a screen's fields

Because every re-authentication screen confirms first (`auth/reauthentication`, "A confirmation never runs the action by itself"), "Confirm with Apple" SHALL be offered only before a screen's own fields show, and returning confirmed SHALL reveal them without mailing a code. When a confirmation expires after something was typed, leaving for Apple loses that input; the mailed code keeps it.

#### Scenario: Back from Apple to the password screen

- **WHEN** an Apple-linked person returns confirmed from "Confirm with Apple" to the password change screen
- **THEN** the new-password field appears and no code is mailed

#### Scenario: Expired before submitting

- **WHEN** an Apple-linked person confirms, waits more than 5 minutes, then submits a new password
- **THEN** nothing changes and the screen asks for a confirmation again, offering Apple first
