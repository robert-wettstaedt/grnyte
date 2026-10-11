# Spec Delta

## Purpose

Keeps grnyte's sign-up and password-reset forms from being used to flood other people's inboxes, and
bounds which emails the app causes to be sent to an address nobody has proved they own.

## ADDED Requirements

### Requirement: A password reset reaches only a confirmed account

The app SHALL send a password-reset email only to an address whose account has confirmed its email.
The response to a reset request SHALL be identical whether an email was sent, the account is
unconfirmed, or no account exists, so the form cannot be used to learn whether an address has an
account.

#### Scenario: Reset for an unconfirmed account

- **WHEN** someone requests a password reset for an address whose account never confirmed its email
- **THEN** no email is sent and the form shows the same "check your inbox" confirmation as a success

#### Scenario: Reset for a confirmed account

- **WHEN** someone requests a password reset for a confirmed account
- **THEN** the reset email is sent and the form shows the same confirmation

#### Scenario: Reset for an unknown address

- **WHEN** someone requests a password reset for an address with no account
- **THEN** no email is sent and the form shows the same confirmation

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

### Requirement: Accounts are created only through grnyte's own sign-up

The authentication service SHALL NOT create an account from a direct public request. An account SHALL
come into existence only through grnyte's sign-up, after the checks above, so the published client
key cannot be used to skip them.

#### Scenario: Direct call to the authentication service

- **WHEN** someone calls the authentication service's public sign-up endpoint directly with the
  published client key
- **THEN** the request is refused and no confirmation email is sent

#### Scenario: Sign-up through grnyte still confirms by email

- **WHEN** a person signs up through grnyte
- **THEN** they receive exactly one confirmation email, with the same content and link as before

### Requirement: Unconfirmed accounts expire

An account that has not confirmed its email within 7 days of creation SHALL be deleted, together with
its profile and settings.

#### Scenario: Never confirmed

- **WHEN** an account created more than 7 days ago still has no confirmed email
- **THEN** the next cleanup run deletes it and its profile and settings

#### Scenario: Confirmed late but within the window

- **WHEN** an account confirms its email on day 6
- **THEN** it is never deleted by this rule

### Requirement: Admins are alerted about confirmed sign-ups only

The admin sign-up alert SHALL be sent when an account confirms its email, not when it is created.

#### Scenario: A bot sign-up that never confirms

- **WHEN** an account is created and never confirmed
- **THEN** no admin alert is sent for it

#### Scenario: A person confirms

- **WHEN** a new account confirms its email for the first time
- **THEN** admins receive the sign-up alert once
