# auth/native-sign-in Specification

## Purpose
Defines how a native client signs in with Apple on iOS, confirms sensitive actions with Apple, keeps its session on the device and passes the sign-up bot check, so the native project builds screens and no new auth features.

## Requirements

### Requirement: Apple on iOS signs in natively with a nonce

On iOS, Sign in with Apple SHALL use the system's native sheet. Every sign-in and link request SHALL carry a fresh random nonce drawn by the app: its SHA-256 hex digest goes to Apple, its raw value goes to grnyte with the identity token. A token without a matching nonce SHALL be refused. A re-authentication instead uses the digest grnyte issued for it.

#### Scenario: Token without a nonce

- **WHEN** an Apple identity token with no nonce claim is presented
- **THEN** sign-in is refused

#### Scenario: Token with a different nonce

- **WHEN** an Apple identity token is presented with a raw nonce whose digest is not the token's nonce
- **THEN** sign-in is refused

### Requirement: A device's Apple identity token is verified before it is used

Every Apple identity token a native client sends SHALL be checked before any of its contents is used: signed with one of Apple's published keys using RS256, issued by Apple, addressed to the app itself, not expired, and carrying the expected nonce. A token that fails any check SHALL be refused with one answer that does not depend on whether an account exists for its address, and SHALL be recorded.

#### Scenario: Forged token with the linked Apple ID

- **WHEN** someone holding a session presents a self-signed token naming the account's linked Apple ID and the nonce grnyte issued
- **THEN** nothing is confirmed and the attempt is recorded

#### Scenario: Token for another app

- **WHEN** a genuine Apple token addressed to another app is presented
- **THEN** it is refused

#### Scenario: Expired token

- **WHEN** a genuine Apple token past its expiry is presented
- **THEN** it is refused

#### Scenario: Forged token as an account probe

- **WHEN** forged tokens naming an address with an account and an address without one are presented for sign-in
- **THEN** both get the same refusal

#### Scenario: Apple's keys unreachable

- **WHEN** Apple's keys cannot be fetched
- **THEN** the answer is 503 `auth_serviceUnavailable` and nothing is refused or recorded as a forgery

### Requirement: Native Apple sign-in follows the web's account rules

A native Apple sign-in SHALL be finished by grnyte's server, applying the same auto-link rule, linking conflicts and contested sign-up handling as a web Apple sign-in, and SHALL return the session in the response.

#### Scenario: Confirmed account at a foreign domain

- **WHEN** a native Apple sign-in carries an address of a confirmed account that has no Apple identity, at a domain Apple does not own
- **THEN** no session is issued and the app is told to sign in and link from settings

#### Scenario: Unconfirmed account marked contested

- **WHEN** a native Apple sign-in carries the address of an unconfirmed, contested account
- **THEN** the person is signed in, the account is confirmed and its contested mark is cleared

### Requirement: Google and Apple on Android use the browser handoff

On Android, and for Google on every platform, a native client SHALL sign in through the system browser and the app handoff, never through an embedded web view.

#### Scenario: Apple on Android

- **WHEN** a person taps "Continue with Apple" on Android
- **THEN** Apple's page opens in the system browser and the app receives a one-time code on return

### Requirement: The app redeems only the code its own flow returned

A native client SHALL exchange a one-time code only when it arrives as the result of the auth session it opened for that flow, and only with that flow's verifier. A return link reaching the app any other way SHALL be ignored. Client contract, not server-verifiable: only the test app proves it.

#### Scenario: Planted link

- **WHEN** another website links to `/app-return?code=` or `rocks.grnyte:/auth?code=` and the person taps it with no sign-in in progress
- **THEN** the app exchanges nothing and stays signed out

### Requirement: Confirm with Apple works natively on iOS for every re-auth action

For an account with a linked Apple identity, every re-authentication in the iOS app SHALL offer "Confirm with Apple" beside the code field; on Android the code is the only confirmation. grnyte SHALL issue a nonce only for a valid action with a target of that action's shape. A native Apple sign-in SHALL count only when its nonce is the one grnyte issued for this account, session, action and target within the last 5 minutes and its subject equals the account's linked Apple identity.

#### Scenario: Apple-linked deletion on Android

- **WHEN** a person with an Apple-linked account deletes it from the Android app
- **THEN** they confirm with the mailed code, the account is deleted, and the skipped Apple revocation is recorded (Apple's revocation rule binds the iOS app only)

#### Scenario: Malformed target

- **WHEN** the app asks for an Apple confirmation of removing a provider with a target that is not a bare provider name, or of an unknown action
- **THEN** no nonce is issued and nothing is stored

#### Scenario: Matching Apple account

- **WHEN** the person confirms deletion with the Apple ID linked to their account, using the nonce issued for that deletion
- **THEN** the deletion is confirmed as a code would confirm it

#### Scenario: Another Apple ID

- **WHEN** someone holding the session confirms with an Apple ID that is not the one linked to the account
- **THEN** nothing is confirmed and the attempt is recorded in the auth event log

#### Scenario: Nonce issued for another target

- **WHEN** an Apple sign-in made with the nonce issued for deleting region A is presented to confirm deleting region B
- **THEN** nothing is confirmed

#### Scenario: Nonce reused

- **WHEN** the same Apple confirmation is presented twice
- **THEN** the second is refused

#### Scenario: Old token

- **WHEN** an Apple confirmation is presented 6 minutes after its nonce was issued
- **THEN** nothing is confirmed

### Requirement: A native Apple confirmation revokes Apple's authorization

When a native Apple confirmation is for deleting the account or removing Apple, it SHALL carry the authorization code from that same sign-in, and grnyte SHALL revoke the app's Apple authorization with it at confirmation, as the web does, storing nothing from Apple. Revocation SHALL run only after the confirming token's Apple ID was matched to the account, and only when Apple's answer to the code names that same Apple ID. A failed revocation SHALL be recorded and SHALL NOT stop the confirmation.

#### Scenario: Someone else's authorization code

- **WHEN** a confirmation carries a valid token for the account's Apple ID together with an authorization code of another Apple ID
- **THEN** nothing is revoked, no revocation is recorded as done, and the mismatch is recorded

#### Scenario: Deleting an Apple account from the app

- **WHEN** a person confirms deletion with Apple in the app and then deletes the account
- **THEN** the app no longer appears as connected in their Apple ID settings, the revocation is recorded, and the deletion mail says Apple access was revoked

#### Scenario: Apple does not answer

- **WHEN** Apple refuses or does not answer the revocation
- **THEN** the confirmation still counts and the failure is recorded

### Requirement: A native client stores its session encrypted

A native client SHALL keep its session encrypted at rest, with the encryption key in the platform's secure key store and the encrypted session in ordinary app storage, and SHALL remove both on sign-out. Client contract, not server-verifiable: only the test app proves it.

#### Scenario: Sign out on the device

- **WHEN** a person signs out in the app
- **THEN** neither the key nor the encrypted session remains on the device

### Requirement: A native client normalises a password before signing in

A native client's direct password sign-in at the authentication service SHALL follow the sign-in rule of `auth/password-policy` (normalise to NFC, never trim or refuse, one retry as entered). To grnyte's own endpoints it SHALL send the password exactly as entered, since they apply that rule themselves. Client contract, not server-verifiable: only the test app proves it.

#### Scenario: A password stored decomposed before normalisation

- **WHEN** a person whose password was stored with "e" plus a combining accent enters it the same way in the app
- **THEN** the retry with the password as entered succeeds

#### Scenario: Decomposed input on the device

- **WHEN** a person whose password contains a composed "é" enters it as "e" plus a combining accent in the app
- **THEN** the sign-in succeeds

### Requirement: A native client passes the same proof-of-work

A native client SHALL obtain the same proof-of-work challenge the web form uses, through the app API, and solve it on the device (client contract, proven by the test app); sign-up SHALL accept no other bot check (server-verified).

#### Scenario: Unsolved challenge

- **WHEN** a native client posts a sign-up without a valid solution
- **THEN** it is refused and no account is created

### Requirement: Code fields autofill on the device

Every code field in a native client SHALL declare itself a one-time code field to the platform, so iOS can offer a code from Mail. Client contract, not server-verifiable: only the test app proves it.

#### Scenario: Code field on iOS

- **WHEN** a person on iOS reaches a code field after a code mail arrived in Apple Mail
- **THEN** the keyboard can offer that code
