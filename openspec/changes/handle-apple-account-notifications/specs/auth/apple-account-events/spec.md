# Spec Delta

## Purpose

Keeps grnyte's view of an Apple-linked account true after the person changes it at Apple: when relay mail forwarding stops or resumes, when they stop using Apple with grnyte, and when they delete their Apple Account.

## ADDED Requirements

### Requirement: Only a notification signed by Apple is acted on

grnyte SHALL act on an Apple account notification only when its signature verifies against Apple's published keys with an algorithm those keys declare, its issuer is Apple, its audience is one of grnyte's Apple client identifiers, and it was issued in the last day and not in the future. Anything else SHALL change nothing. Only a notification Apple signed for grnyte that fails a later check SHALL be recorded as a failed notification; any other refused request SHALL NOT be recorded.

#### Scenario: Forged notification

- **WHEN** a request to the notification endpoint carries a token not signed by Apple
- **THEN** nothing changes for any account and the event log gains nothing

#### Scenario: Old notification

- **WHEN** a notification Apple signed for grnyte was issued more than a day ago
- **THEN** nothing changes and a failed notification is recorded

#### Scenario: Another app's notification

- **WHEN** a notification signed by Apple names an audience that is not one of grnyte's Apple client identifiers
- **THEN** nothing changes and the event log gains nothing

#### Scenario: A sign-in token posted as a notification

- **WHEN** someone posts their own Apple sign-in token for grnyte to the notification endpoint, again and again
- **THEN** nothing changes and the event log gains nothing

#### Scenario: Apple's keys unreachable

- **WHEN** Apple's key set cannot be fetched while a notification arrives
- **THEN** nothing changes and the endpoint answers that it is unavailable, so a sender that retries can retry

### Requirement: A notification is matched to one account

A notification SHALL apply to the account whose Apple identity has the notification's Apple user, or, for a forwarding notification with no such identity, the account whose address equals the notification's address. A notification matching no account SHALL change nothing and SHALL still be recorded.

#### Scenario: Apple removed earlier, relay address kept

- **WHEN** a person removed Apple but kept their relay address, and later turns forwarding off for grnyte
- **THEN** the notification applies to their account by its address

#### Scenario: Unknown Apple user

- **WHEN** a notification names an Apple user no account has
- **THEN** nothing changes and the event log records it without an account

### Requirement: Turning forwarding off marks the address as not receiving mail

On `email-disabled` for an Apple relay address, grnyte SHALL record that the address no longer receives mail. When the account's address is a different one by then, the notification SHALL change nothing the person sees. A real address the person shared with Apple SHALL never be recorded as not receiving mail.

#### Scenario: Forwarding turned off

- **WHEN** a person whose address is their relay address turns off forwarding for grnyte at Apple
- **THEN** grnyte records that the address no longer receives mail

#### Scenario: Address already changed

- **WHEN** a person changed their grnyte address to `ana@example.org` and then turns off forwarding for their relay address
- **THEN** no banner appears and mail to `ana@example.org` continues

### Requirement: Settings tell the person their address receives no mail

While the account's current address is recorded as not receiving mail, the email screen SHALL show a banner naming the address, saying mail to it does not reach them because Apple's forwarding is off, and how to get a working address. With Apple linked: turn forwarding back on in their Apple Account settings, then change the address in grnyte. With Apple no longer linked: the same if their Apple Account still exists, otherwise message support through Feedback while signed in.

#### Scenario: Support changes the address

- **WHEN** a person who has a password and whose Apple Account was deleted sends support, through Feedback while signed in, the one-time phrase support gave them
- **THEN** support changes their address to one they name, and nothing else about the person (knowledge of their regions or ascents) is accepted as proof

#### Scenario: Banner shown

- **WHEN** a person whose relay address has forwarding off and who has Apple linked opens the email screen
- **THEN** the banner names their address, says mail to it does not reach them, and says to turn Apple's forwarding back on before changing the address

#### Scenario: Apple Account deleted

- **WHEN** a person with a password whose Apple Account was deleted opens the email screen
- **THEN** the banner says mail to their address does not reach them and, if their Apple Account no longer exists, to message support through Feedback while signed in

#### Scenario: Banner gone after a change of address

- **WHEN** that person turns forwarding back on and changes their address to `ana@example.org`
- **THEN** no banner is shown, also if forwarding is turned off again for the old relay address

### Requirement: grnyte sends none of its own mail to an address that receives none

grnyte SHALL NOT send any mail of its own to an address recorded as not receiving mail, except the account deletion mail, which is sent after the account and its record are gone. Mail the authentication service sends itself is out of grnyte's reach and SHALL NOT be claimed as stopped.

#### Scenario: Role change mail

- **WHEN** a person whose address has forwarding off has their role in a region changed
- **THEN** no mail is sent to that address

#### Scenario: Confirming it's you

- **WHEN** a person whose address has forwarding off and who has Apple linked asks for a code to confirm it's them
- **THEN** no code is mailed, the screen says mail to their address does not reach them, and it offers "Confirm with Apple"

#### Scenario: Confirming it's you without Apple

- **WHEN** a person whose address has forwarding off and whose Apple was removed asks for a code to confirm it's them
- **THEN** no code is mailed and the screen says mail to their address does not reach them and how to get help

### Requirement: Turning forwarding on clears the mark

On `email-enabled` for an address recorded as not receiving mail, grnyte SHALL clear that record, so the banner goes and grnyte's mail resumes.

#### Scenario: Forwarding turned back on

- **WHEN** a person turns forwarding back on for grnyte at Apple
- **THEN** the banner is gone on their next load of settings and grnyte's mails reach the address again

### Requirement: Stopping Apple for grnyte removes Apple when another way in remains

On `consent-revoked` for an account that also has a password or Google, grnyte SHALL remove the Apple identity without changing the account's address, mail the notice that Apple can no longer sign in, and sign out every device of the account.

#### Scenario: Password and Apple

- **WHEN** a person with a password and Apple chooses "Stop using Apple ID" for grnyte at Apple
- **THEN** Apple is no longer listed in their sign-in methods, their address is unchanged, every device is signed out, and they can sign in with their password

### Requirement: Stopping Apple for grnyte keeps Apple when it is the only way in

On `consent-revoked` for an account whose only way in is Apple, grnyte SHALL keep the Apple identity and sign out every device. The next "Continue with Apple" with the same Apple ID SHALL sign in to the same account once the person agrees at Apple again.

#### Scenario: Apple-only account

- **WHEN** a person whose only way in is Apple stops using Apple for grnyte at Apple, then later continues with Apple
- **THEN** every device was signed out, and the later sign-in lands in the same account with its data

### Requirement: No removal leaves an account without a way in

Removing Apple or Google SHALL be refused when afterwards the account would have neither a password nor another provider, also when two removals run at the same time, whether the person or an Apple notification starts them.

#### Scenario: Apple notification while the person removes Google

- **WHEN** an account with Apple and Google and no password receives `consent-revoked` while the person removes Google on another device
- **THEN** exactly one of the two removals completes and the account can still sign in

### Requirement: grnyte's own revocation is not taken as the person's

A `consent-revoked` or `account-deleted` arriving within 10 minutes of grnyte starting its own revocation of the account's Apple authorization SHALL change nothing, also when Apple's answer to that revocation has not arrived or was lost.

#### Scenario: Deleting the account through Apple

- **WHEN** a person confirms with Apple to delete their account and Apple then sends `consent-revoked` before they press Delete
- **THEN** they stay signed in and the deletion completes

### Requirement: A deleted Apple Account never deletes the grnyte account

On `account-deleted`, grnyte SHALL act as on `consent-revoked` and SHALL also record the Apple identity's address as not receiving mail when it is an Apple relay address. It SHALL NOT delete the grnyte account or any of its content.

#### Scenario: Apple Account deleted, password set

- **WHEN** a person with a password and a relay address deletes their Apple Account
- **THEN** Apple is removed, every device is signed out, the banner shows on their next sign-in with their password, and their content is unchanged

#### Scenario: Apple Account deleted, Apple only

- **WHEN** a person whose only way in is Apple deletes their Apple Account
- **THEN** every device is signed out and the account and its content remain

#### Scenario: Shared real address

- **WHEN** a person who shared their real address `ana@gmail.com` with Apple and set a password deletes their Apple Account
- **THEN** Apple is removed and grnyte keeps mailing `ana@gmail.com`

### Requirement: An older or repeated notification changes nothing

A forwarding notification whose event time is not later than the last forwarding change grnyte applied to that account SHALL change nothing. A `consent-revoked` or `account-deleted` SHALL NOT remove an Apple identity linked after its event time, nor sign out a device signed in after it.

#### Scenario: Out of order

- **WHEN** a person turns forwarding off and on again and grnyte receives the `email-enabled` before the `email-disabled`
- **THEN** the address is recorded as receiving mail

#### Scenario: Replay after re-adding Apple

- **WHEN** a person re-adds Apple after stopping it, and the earlier `consent-revoked` is delivered again
- **THEN** Apple stays linked and nobody is signed out

#### Scenario: Repeated delivery, Apple only

- **WHEN** a person whose only way in is Apple stops using it, signs in with Apple again, and the earlier `consent-revoked` is delivered again
- **THEN** their new sign-in stays signed in

### Requirement: A lost notification is not recovered

grnyte SHALL NOT poll Apple for account state. When a notification never arrives, grnyte's state SHALL stay as it was.

#### Scenario: Lost email-disabled

- **WHEN** Apple's `email-disabled` never reaches grnyte
- **THEN** no banner is shown and grnyte keeps mailing the address

### Requirement: Every notification is recorded

Each notification Apple signed for grnyte SHALL be recorded in the auth event log with its type and outcome, and with the account when matched, never with an address or Apple's user identifier. A failed notification SHALL count toward the admins' spike alert.

#### Scenario: Recorded consent revocation

- **WHEN** a `consent-revoked` removes Apple from an account
- **THEN** the event log holds that event for the account with the outcome "removed" and no address
