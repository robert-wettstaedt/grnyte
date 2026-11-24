# sign-up-protection Specification

## Purpose

Keeps grnyte's sign-up and password-reset forms from being used to flood other people's inboxes, and
bounds which emails the app causes to be sent to an address nobody has proved they own.

## Requirements

### Requirement: A password reset reaches only a confirmed account

The app SHALL send a password-reset code only to an address whose account has confirmed its email. A reset request for an address whose account is unconfirmed SHALL instead mark that account contested and send it a new confirmation code; if the mark cannot be stored, nothing SHALL be sent. When nothing fails, the response to a reset request SHALL read the same whether a reset code was sent, a confirmation code was sent, or no account exists. A real failure (the authentication service unreachable, the mail quota spent) SHALL be shown. The response time MAY differ; that leak is an accepted risk.

#### Scenario: Reset for an unconfirmed account

- **WHEN** someone requests a password reset for an address whose account never confirmed its email
- **THEN** the account is marked contested, a new confirmation code is sent instead of a reset code, and the form shows the same "check your inbox" confirmation as a success

#### Scenario: Reset for a confirmed account

- **WHEN** someone requests a password reset for a confirmed account
- **THEN** the reset code is sent and the form shows the same confirmation

#### Scenario: Reset for an unknown address

- **WHEN** someone requests a password reset for an address with no account
- **THEN** no email is sent and the form shows the same confirmation

#### Scenario: Reset for an account that has no password

- **WHEN** someone requests a password reset for a confirmed account that signs in only with another method
- **THEN** the reset code is sent, and completing it sets the account's first password

### Requirement: Sign-up and reset require a solved proof-of-work check

A sign-up or password-reset submission SHALL be refused unless it carries a proof-of-work solution the
server issued within the last 10 minutes and has not accepted before. A person using the form SHALL
NOT have to do anything to produce it: the browser solves it in the background while they type.

#### Scenario: A real person signs up

- **WHEN** a person fills in the sign-up form in a browser and submits
- **THEN** the account is created without them seeing a puzzle or waiting on one

#### Scenario: Submission without a solution

- **WHEN** a sign-up or reset request arrives with no solution, an invalid one, or one older than
  10 minutes
- **THEN** it is refused, no account is created and no email is sent

#### Scenario: A solution is replayed

- **WHEN** a solution that was already accepted once is submitted again, for any address
- **THEN** the second submission is refused

### Requirement: Filled honeypot submissions are refused silently

Sign-up and password reset SHALL carry a field that people never see and assistive technology and
password managers skip. A submission with that field filled SHALL create no account and send no email,
and SHALL receive a response a bot cannot tell apart from success.

#### Scenario: A bot fills every field

- **WHEN** a sign-up arrives with the hidden field filled
- **THEN** no account is created, no email is sent, and the response looks like a normal success

#### Scenario: A person with a password manager

- **WHEN** a person signs up using a password manager or screen reader
- **THEN** the hidden field stays empty and the sign-up succeeds

### Requirement: Email accounts are created only through grnyte's own sign-up

The authentication service SHALL refuse every email, phone and anonymous account created by a direct public request, while its public sign-up stays switched on for other sign-in providers. An email account SHALL come into existence only through grnyte's sign-up, after the checks above, so the published client key cannot be used to skip them. A deployed environment's configuration SHALL be checked for this refusal.

#### Scenario: Direct call to the authentication service

- **WHEN** someone calls the authentication service's public sign-up or email-code endpoint directly with the published client key and a new address
- **THEN** the request is refused, no account is created and no email is sent

#### Scenario: Sign-up through grnyte still confirms by email

- **WHEN** a person signs up through grnyte
- **THEN** they receive exactly one confirmation email, carrying an 8-digit code and no link

#### Scenario: Refusal missing in a deployed environment

- **WHEN** the configuration check runs against an environment whose sign-up refusal is missing or switched off
- **THEN** the check fails and names the refusal

#### Scenario: Code length in a deployed environment

- **WHEN** the configuration check runs against an environment whose mailed codes are not 8 digits long
- **THEN** the check fails and names the code length

### Requirement: Unconfirmed accounts expire

An account that has not confirmed its email within 7 days of creation SHALL be deleted, together with
its profile and settings.

#### Scenario: Never confirmed

- **WHEN** an account created more than 7 days ago still has no confirmed email
- **THEN** the next cleanup run deletes it and its profile and settings

#### Scenario: Confirmed late but within the window

- **WHEN** an account confirms its email on day 6
- **THEN** it is never deleted by this rule

### Requirement: The authentication service behaviours grnyte relies on are pinned to a tested release

Every behaviour of the authentication service that grnyte's code relies on and the service does not promise SHALL be asserted by one test suite run against a local copy of the service, and the release that suite last passed on SHALL be recorded as one pinned version. The configuration check SHALL compare a deployed environment's service version with that pin, so a release the hosting provider rolled out without notice is noticed the next time the check runs.

#### Scenario: Deployed service differs from the tested release

- **WHEN** the configuration check runs against an environment whose authentication service reports a version other than the pinned one
- **THEN** the check fails, naming the deployed version, the pinned version and the runbook for a new version

#### Scenario: Deployed service is the tested release

- **WHEN** the configuration check runs against an environment whose authentication service reports the pinned version
- **THEN** the version check passes

#### Scenario: A relied-on behaviour changed

- **WHEN** the suite runs against a release in which one relied-on behaviour no longer holds
- **THEN** that behaviour's test fails, and the test names the grnyte code that depends on it
