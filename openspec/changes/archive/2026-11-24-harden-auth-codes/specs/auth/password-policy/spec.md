# Spec Delta

## Purpose

Decides which passwords grnyte accepts, so an account is not protected by a password already known from breaches.

## ADDED Requirements

### Requirement: Passwords are between 8 characters and 72 bytes

A new password SHALL have at least 8 characters and at most 72 bytes in UTF-8, measured after normalisation. The rule SHALL apply on create account, setting a first password, changing a password and resetting one, and SHALL be shown as a field error before anything is stored.

#### Scenario: Too long

- **WHEN** a person enters a 73-byte password
- **THEN** the field says it is too long and nothing is stored

### Requirement: A new password has no surrounding whitespace

A new password SHALL be refused with a message saying why when it starts or ends with a space or other whitespace; grnyte SHALL NOT trim it. The refusal SHALL apply only when a password is set or changed (create account, first password, change, reset), never at sign-in.

#### Scenario: Trailing space

- **WHEN** a person sets the password "correct horse " with a trailing space
- **THEN** it is refused with a message that a password cannot start or end with a space, and nothing is stored

### Requirement: Passwords are compared in one Unicode form

A password SHALL be normalised to Unicode NFC before it is checked and stored when set or changed, and before it reaches the authentication service at sign-in, on the web and in the native app. When a sign-in with the normalised password is refused as invalid credentials and the password as entered differs from its normalised form, the sign-in SHALL be tried once more with the password as entered, so a password stored before this rule in a decomposed form keeps working.

#### Scenario: Decomposed characters

- **WHEN** a person sets a password containing "é" typed as "e" plus a combining accent
- **THEN** it is stored in its composed form, and signing in with the composed "é" works

#### Scenario: Sign-in with a decomposed form

- **WHEN** a person whose password contains a composed "é" signs in from a keyboard that types "e" plus a combining accent
- **THEN** the sign-in succeeds

#### Scenario: A password stored decomposed before this rule

- **WHEN** a person whose password was stored before this rule with "e" plus a combining accent signs in typing it the same way
- **THEN** the normalised attempt is refused, the retry with the password as entered succeeds, and the person is signed in

#### Scenario: No retry when normalising changes nothing

- **WHEN** a person signs in with a wrong password that is already in NFC
- **THEN** the authentication service is called once and the sign-in is refused

#### Scenario: Sign-in keeps surrounding spaces

- **WHEN** a person whose password was set before this rule with a trailing space signs in with it
- **THEN** the space is kept and the sign-in succeeds

### Requirement: Known breached passwords are refused

A new password SHALL be refused when it appears in the Have I Been Pwned breach corpus, checked without sending the password or its full hash anywhere. When that service cannot be reached in time, the password SHALL be checked against a bundled list of the 10,000 most common passwords instead. The refusal SHALL say the password appeared in a breach.

#### Scenario: A breached password

- **WHEN** a person chooses "password123"
- **THEN** it is refused with the breach message

#### Scenario: Breach service down

- **WHEN** the breach service does not answer and the person chooses a password on the bundled list
- **THEN** it is refused with the same message

#### Scenario: Breach service down, uncommon password

- **WHEN** the breach service does not answer and the password is not on the bundled list
- **THEN** it is accepted
