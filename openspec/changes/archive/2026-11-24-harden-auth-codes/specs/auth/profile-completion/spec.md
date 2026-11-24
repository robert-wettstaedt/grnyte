# Spec Delta

## Purpose

Gives every new account, however it was created, one short step that sets the username and grading scale before the app opens, and tells admins about real new people at that moment.

## ADDED Requirements

### Requirement: Every new account completes a profile step

An account with no profile SHALL be shown the profile step at `/auth/profile`, asking for a username (required) and a grading scale (FB or V). The grading scale SHALL be preselected by the UI language, not the country: FB in German, V in English. The step SHALL show a notice line linking the terms and the privacy policy, with no checkbox, and SHALL store nothing about it.

#### Scenario: After confirming a sign-up

- **WHEN** a person confirms their address
- **THEN** they see the profile step with the grading scale preselected for the UI language

#### Scenario: German UI

- **WHEN** a person using grnyte in German reaches the profile step
- **THEN** FB is preselected, wherever the person is

#### Scenario: Invalid username

- **WHEN** a person submits a username that breaks the username rules
- **THEN** the field shows the error and no profile is created

#### Scenario: Completing the step

- **WHEN** a person submits a valid username and grading scale
- **THEN** their profile and settings exist, their contact language is the language of the request, and they continue into the app

### Requirement: The app is closed until the profile exists

A signed-in account with no profile SHALL be sent to the profile step from every app screen, on a full page load and on in-app navigation. Only the profile step, sign-out and the legal pages SHALL be reachable. No synced write SHALL be accepted from it. The gate SHALL apply to opening pages, not to the account's own sign-in, code and password steps called from a screen it is already on, so a reset or a contested confirmation can finish before a profile exists.

#### Scenario: Opening an app screen

- **WHEN** a signed-in account with no profile opens `/explore`
- **THEN** it lands on the profile step

#### Scenario: Legal pages

- **WHEN** it opens the privacy policy
- **THEN** the page shows

#### Scenario: Choosing a password before the profile exists

- **WHEN** a person who confirmed a contested account by code chooses their password on the create-account screen
- **THEN** the password is saved, and only then are they sent to the profile step

#### Scenario: Profile already complete

- **WHEN** an account with a profile opens `/auth/profile`
- **THEN** it is sent on into the app

### Requirement: The original destination survives the profile step

The destination a person was headed to before the gate, such as an invitation, SHALL be kept and opened after the profile step. Only a path on grnyte's own origin outside `/auth` SHALL be followed; anything else SHALL fall back to the app's home.

#### Scenario: Signing up from an invitation

- **WHEN** a person opens an invitation, creates an account, confirms it and completes the profile step
- **THEN** they land on that invitation

#### Scenario: A foreign destination

- **WHEN** the kept destination points at another origin
- **THEN** the person lands on the app's home instead

### Requirement: Admins are alerted when a profile is completed

The admin sign-up alert SHALL be sent once per account when its profile step completes, whether the account was made with an email or another sign-in method. Confirming an address SHALL NOT send it, and an account that never completes the step SHALL never cause one.

#### Scenario: Unfinished sign-up

- **WHEN** a person confirms their address and never completes the profile step
- **THEN** no admin alert is sent

#### Scenario: Completed profile

- **WHEN** a person completes the profile step
- **THEN** admins receive the sign-up alert once, naming the chosen username

### Requirement: Accounts without a profile expire

An account that has no profile 7 days after it was created, whether or not its address is confirmed, SHALL be deleted. An account whose profile was removed by an account deletion SHALL be deleted at the next cleanup and SHALL NOT be able to create a new profile meanwhile.

#### Scenario: Confirmed but never finished

- **WHEN** an account confirmed its address 8 days ago and never completed the profile step
- **THEN** the next cleanup deletes it

#### Scenario: Within the window

- **WHEN** an account created 3 days ago has no profile
- **THEN** the cleanup leaves it alone

#### Scenario: Leftover of a deleted account

- **WHEN** an account deletion removed the profile but the sign-in record survived
- **THEN** signing in with it, by password or any other sign-in method, signs the person straight out with a message that the account was deleted, never opens the profile step, and the next cleanup deletes it
