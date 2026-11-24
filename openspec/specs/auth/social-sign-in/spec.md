# auth/social-sign-in Specification

## Purpose
Lets a person sign in to grnyte, or create an account, with their Apple or Google account on the web, on grnyte's own domain, without a provider sign-in ever taking over an account it does not own.

## Requirements

### Requirement: Apple and Google sign-in run on grnyte's own domain

A person SHALL be able to sign in or create an account with Apple or with Google. The provider's consent screen and any system dialog SHALL name grnyte's own domain, not the authentication service's. No provider script SHALL load before the person presses a provider button.

#### Scenario: Continue with Google

- **WHEN** a signed-out person presses "Continue with Google" and approves at Google
- **THEN** they come back to grnyte signed in, and Google's screen named grnyte's domain

#### Scenario: Opening the sign-in screen

- **WHEN** a person opens `/auth/signin`
- **THEN** no request goes to Apple or Google until they press a provider button

### Requirement: A provider sign-in completes once, within 10 minutes, in the browser that started it

Each provider sign-in SHALL belong to the browser that started it and SHALL complete at most once, within 10 minutes of starting. A return from the provider that does not match a sign-in this browser started, arrives a second time, or arrives late SHALL sign nobody in and SHALL show the expired state.

#### Scenario: Replayed return

- **WHEN** the return URL of a completed sign-in is opened again
- **THEN** nobody is signed in and the screen offers to try again

#### Scenario: Return in another browser

- **WHEN** someone opens a provider's return URL in a browser that did not start that sign-in
- **THEN** nobody is signed in in that browser

#### Scenario: Late return

- **WHEN** the provider returns 11 minutes after the sign-in started
- **THEN** nobody is signed in and the screen offers to try again

### Requirement: A return is accepted only from the provider that was started

Each provider SHALL return to its own address. A return SHALL be refused when it arrives at the other provider's address, or when it names an issuer other than the provider that was started. Each refusal SHALL be recorded in the auth event log.

#### Scenario: Mixed-up provider

- **WHEN** a sign-in started with Google comes back at Apple's return address
- **THEN** nobody is signed in and the refusal is recorded

### Requirement: Apple's cross-site return becomes a same-origin request

Apple's return, which Apple posts to grnyte from its own site, SHALL be answered only with a redirect to the same Apple return address as a same-origin GET, carrying the answer and setting no cookie, and SHALL be one of the requests exempt from refusing cookie-authenticated cross-site requests (`auth/cross-site-requests`), beside the app API. Every cookie grnyte sets for sign-in SHALL be `SameSite=Lax`; none SHALL be `SameSite=None`.

#### Scenario: Linking Apple from settings

- **WHEN** a signed-in person links Apple and Apple posts its answer back
- **THEN** grnyte redirects to its own Apple return address, the follow-up request carries the person's session, and Apple is linked to that account

#### Scenario: Cookie attributes

- **WHEN** any provider sign-in sets or clears a cookie
- **THEN** the cookie is `SameSite=Lax`

### Requirement: The provider's identity proof is bound to this sign-in

Each sign-in SHALL carry a fresh random value. The provider SHALL receive only its SHA-256 hash, and the authentication service the value itself, so a proof issued for another sign-in is useless. A proof whose value does not match SHALL be refused and recorded.

#### Scenario: Proof from another sign-in

- **WHEN** an identity proof issued for a different sign-in is presented in this one
- **THEN** nobody is signed in and the mismatch is recorded

### Requirement: The destination after sign-in is a path on grnyte

The place a person was headed to, such as an invitation, SHALL be kept across the provider round trip without appearing in any address the provider sees, and SHALL be followed only if it is a path on grnyte's own origin outside `/auth`. Anything else SHALL land on the app's home.

#### Scenario: Signing in from an invitation

- **WHEN** a person opens an invitation, chooses "Continue with Apple" and approves
- **THEN** they land on that invitation, after the profile step if their account is new

#### Scenario: Foreign destination

- **WHEN** the destination given at the start points at another origin
- **THEN** the person lands on the app's home

### Requirement: A new person passes the profile step

A provider sign-in that creates an account SHALL lead to the profile step before any app screen, and then to the destination.

#### Scenario: First Apple sign-in

- **WHEN** a person with no grnyte account continues with Apple
- **THEN** an account is created and they see the profile step

### Requirement: A known provider identity signs in to its own account

A provider identity already linked to an account SHALL sign in to that account, whatever address the provider reports now.

#### Scenario: Changed address at the provider

- **WHEN** a person whose Google identity is linked changes their Google address and continues with Google
- **THEN** they are signed in to the same grnyte account

### Requirement: A provider never joins a confirmed account on its own

When the provider's address belongs to a confirmed account that has no identity of that provider, the sign-in SHALL be refused and the person told to sign in the way they usually do and link the provider in settings, unless the provider owns the address's domain, by the database's list (`auth/reauthentication`, "A provider may join an address it owns"). Each refusal SHALL be recorded.

#### Scenario: Company address at Google

- **WHEN** a person whose confirmed grnyte account uses `ana@example.org` continues with a Google account using the same address
- **THEN** nobody is signed in, and the screen says an account already exists for that email, without showing the address or naming the provider, and how to add it from settings

#### Scenario: Gmail address

- **WHEN** a person whose confirmed grnyte account uses `ana@gmail.com` continues with Google as `ana@gmail.com`
- **THEN** Google is linked to that account and they are signed in

#### Scenario: Address in a different case

- **WHEN** the provider reports `Ana@Example.org` for a confirmed account stored as `ana@example.org`
- **THEN** the sign-in is refused as for the same address

### Requirement: A provider takes over an unconfirmed address

When the provider's address belongs to an account whose address was never confirmed, the provider sign-in SHALL take that account over: any password on it SHALL stop working, the address SHALL count as confirmed, and the account SHALL no longer count as contested.

#### Scenario: Stranger signed up with my address

- **WHEN** someone created an unconfirmed account with Ana's address and Ana then continues with Google using it
- **THEN** Ana is signed in, the stranger's password no longer works, and Ana sees the profile step

### Requirement: Cancelling at the provider returns quietly

When the person cancels or denies at the provider, they SHALL return to the screen they started from, with no error shown and nothing changed.

#### Scenario: Cancel at Apple

- **WHEN** a person presses "Continue with Apple" and then cancels at Apple
- **THEN** they are back on the sign-in screen with no message

#### Scenario: Cancel from create account

- **WHEN** a person presses "Continue with Google" on the create-account screen and then cancels at Google
- **THEN** they are back on the create-account screen with no message

### Requirement: A failed provider sign-in says what to do next

Every other failed return SHALL show one error screen naming the reason: expired (try again), failed (try again), offline (check the connection), an account exists for that address (sign in and link from settings), or the identity belongs to another account. The screen SHALL always offer exactly one action, a way back to the screen where the person started, checked again as a path on grnyte when read, and to a fixed screen for the kind of flow when that is unknown.

#### Scenario: Late Confirm with Apple

- **WHEN** a person starts "Confirm with Apple" on a region's deletion screen and returns from Apple after more than 10 minutes
- **THEN** the error screen says it expired and "Try again" leads back to that region's deletion screen

#### Scenario: Forged way back

- **WHEN** the error screen is opened with a way back pointing at another origin
- **THEN** its action leads to the fixed screen for that kind of flow instead

#### Scenario: Provider error

- **WHEN** the provider returns an error other than a cancellation
- **THEN** the error screen says the sign-in failed and offers "Try again"

#### Scenario: Unknown reason

- **WHEN** the error screen is opened with a reason it does not know
- **THEN** it shows the generic failure

### Requirement: The error screen is announced

On load the error screen SHALL move focus to its heading, and its offline state SHALL be announced as a status.

#### Scenario: Screen reader on the error screen

- **WHEN** a screen reader user returns from a failed provider sign-in
- **THEN** the error's heading is read first, and an offline message is announced without moving focus

### Requirement: Losing the connection during the round trip shows the offline state

When the device is offline as the provider returns, or as the person presses a provider button, the person SHALL see the offline state instead of a broken page.

#### Scenario: Offline on return

- **WHEN** the connection drops while the person is at Google and Google redirects back
- **THEN** the error screen shows the offline state

#### Scenario: Offline before starting

- **WHEN** the device is offline and the person presses "Continue with Apple"
- **THEN** the screen says they are offline and does not leave grnyte

### Requirement: Google asks which account and both providers speak the person's language

Google SHALL always show its account chooser. Both providers SHALL be asked to show their screens in grnyte's current language.

#### Scenario: Several Google accounts

- **WHEN** a person signed in to two Google accounts presses "Continue with Google"
- **THEN** Google asks which account to use

#### Scenario: German

- **WHEN** a person using grnyte in German presses "Continue with Apple"
- **THEN** Apple is asked to show its screen in German

### Requirement: Provider profile data is neither asked for nor shown

grnyte SHALL ask providers only for the identity and the email address, SHALL NOT ask for a name or a picture, and SHALL NOT show any name or picture a provider sends.

#### Scenario: First Apple sign-in

- **WHEN** a person signs in with Apple for the first time
- **THEN** Apple does not ask to share their name, and the profile step starts with an empty username

### Requirement: A deployed environment is checked for its provider setup

The configuration check SHALL fail for a deployed environment unless Apple and Google accept grnyte's identity proofs with grnyte's web client listed first, neither skips the proof's random value check, manual linking is on, the identity linked and unlinked notices are on, and the deployed sign-in screen shows both buttons.

#### Scenario: Nonce check skipped

- **WHEN** the check runs against an environment where Google skips the random value check
- **THEN** the check fails and names that setting

#### Scenario: Missing credentials

- **WHEN** the deployed app lacks Apple's credentials, so its sign-in screen shows no Apple button
- **THEN** the check fails and names the missing button

### Requirement: A deleted account cannot sign in with a provider

A provider sign-in for an account that is being deleted SHALL be refused after the provider answers, end the session the authentication service just opened, and land on the sign-in screen saying the account was deleted.

#### Scenario: Google sign-in after deleting the account

- **WHEN** a person who deleted their account signs in with Google before the account is swept
- **THEN** no session remains and the sign-in screen says the account was deleted
