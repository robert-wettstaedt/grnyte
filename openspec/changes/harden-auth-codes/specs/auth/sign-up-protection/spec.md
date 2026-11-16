# Spec Delta

## RENAMED Requirements

- FROM: `### Requirement: Accounts are created only through grnyte's own sign-up`
- TO: `### Requirement: Email accounts are created only through grnyte's own sign-up`

## ADDED Requirements

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

## MODIFIED Requirements

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

## REMOVED Requirements

### Requirement: Admins are alerted about confirmed sign-ups only

**Reason**: Accounts made with another sign-in method are never confirmed by mail, and a confirmed account is not yet a person who finished signing up. The alert moves to the end of the profile step.

**Migration**: See `auth/profile-completion`, "Admins are alerted when a profile is completed". Confirming an address no longer alerts.
