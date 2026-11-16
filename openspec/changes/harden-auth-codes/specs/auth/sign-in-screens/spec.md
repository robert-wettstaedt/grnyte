# Spec Delta

## Purpose

Defines the screens a person uses to sign in and to create an account, their wording, and what they say when something fails, so every sign-in method can sit in the same place on both.

## ADDED Requirements

### Requirement: Sign-in and create-account are two screens with one switch line

`/auth/signin` and `/auth/signup` SHALL stay separate screens with no tab control. Each SHALL end with one line switching to the other, carrying any invitation address and destination across. The screens SHALL say "Sign in" and "Create account" (German "Anmelden" and "Konto erstellen") and SHALL never show "Sign up" beside "Sign in".

#### Scenario: Switching with an invitation

- **WHEN** a person who arrived from an invitation switches from sign-in to create account
- **THEN** the create-account screen keeps the invited address and the invitation as destination

#### Scenario: Wording

- **WHEN** either screen is shown in English or German
- **THEN** its title and button read "Sign in" / "Anmelden" or "Create account" / "Konto erstellen"

### Requirement: Create account asks only for email and password

The create-account screen SHALL ask for an email and a password, with a control that shows or hides the password, and SHALL NOT ask for a username or a repeated password. Its bot checks SHALL stay as they are.

#### Scenario: Showing the password

- **WHEN** a person presses Show on the password field
- **THEN** the password is shown as text, and pressing again hides it

### Requirement: Other sign-in methods come before the email form, never beside it

Both screens SHALL reserve one first step, the same on both, for choosing among other ways to sign in, and SHALL show the email form only after that choice (in `add-social-sign-in`, "Continue with email"). With no other method available that step SHALL not exist: the screens SHALL open on the email form and read complete.

#### Scenario: No other methods

- **WHEN** no other sign-in method is configured
- **THEN** both screens open on the email form and the switch line, with no gap and no extra step

### Requirement: A failed sign-in does not say why

A sign-in with an unknown address or a wrong password SHALL fail with the same message, which SHALL NOT reveal whether the address has an account.

#### Scenario: Unknown address

- **WHEN** a person signs in with an address that has no account
- **THEN** the message is the same as for a wrong password

### Requirement: Signing in to an unconfirmed account leads to the code

A sign-in with the right password for an account whose address is not confirmed SHALL send a new confirmation code and open code entry for that address, without marking the account contested. A wrong password on such an account SHALL fail like any other and send nothing.

#### Scenario: Closed the screen before confirming

- **WHEN** a person who signed up but never entered the code signs in with their password
- **THEN** a new code is mailed and the code entry opens, and after the code they go straight to the profile step

#### Scenario: Wrong password on an unconfirmed account

- **WHEN** someone signs in to an unconfirmed account with a wrong password
- **THEN** the generic failure shows and no mail is sent

### Requirement: The installed app opens on a welcome choice

When grnyte runs as an installed app and nobody is signed in, the sign-in screen SHALL first show a welcome choice between "Sign in" and "Create account", from its first paint, without the sign-in form showing first and being replaced. The choice SHALL appear only when the sign-in screen is opened with nothing to carry (no destination, address or message); every link inside grnyte that leads to the sign-in form SHALL land on the form. In a browser tab the sign-in screen SHALL open directly.

#### Scenario: Installed app

- **WHEN** a signed-out person opens the installed app
- **THEN** they see the welcome choice, and "Create account" opens the create-account screen

#### Scenario: Browser tab

- **WHEN** a signed-out person opens `/auth/signin` in a browser tab
- **THEN** the sign-in screen shows directly, not the welcome choice

#### Scenario: Back-link inside the installed app

- **WHEN** a person in the installed app follows "Sign in" from the create-account screen, or arrives from an invitation or the "account deleted" message
- **THEN** the sign-in screen shows (its first step: the form, or the choice of methods once other methods exist), not the welcome choice

### Requirement: The terms notice appears before and at the profile step

The welcome choice, the sign-in screen and the create-account screen SHALL show the terms and privacy line they show today, and the profile step SHALL show its own notice without a checkbox.

#### Scenario: Create account

- **WHEN** a person opens the create-account screen
- **THEN** the terms and privacy line is shown below the form
