# Spec Delta

## ADDED Requirements

### Requirement: The screens open on a choice of methods

On both `/auth/signin` and `/auth/signup`, when at least one provider is available, the screen SHALL open on a choice: "Continue with Apple", then "Continue with Google", then "Continue with email" (German "Weiter mit Apple", "Weiter mit Google", "Weiter mit E-Mail"), the same on both screens and the same size, the provider buttons in their brand style. The email form SHALL follow "Continue with email" on the same screen, and going back SHALL return to the choice.

#### Scenario: Both screens

- **WHEN** a person opens the sign-in screen and then the create-account screen
- **THEN** both show the same three buttons, Apple first and email last, and no email field

#### Scenario: Continue with email

- **WHEN** a person presses "Continue with email" and then goes back
- **THEN** the email form shows, and going back shows the choice again

#### Scenario: Invited address

- **WHEN** a person arrives from an invitation and presses "Continue with email" without first leaving for Apple or Google
- **THEN** the email form shows with the invited address filled in

### Requirement: Provider buttons follow both brand guides

Each provider button SHALL follow its provider's sign-in button guideline in colour, typography, logo and dark variant ([Apple](https://developer.apple.com/design/human-interface-guidelines/sign-in-with-apple), [Google](https://developers.google.com/identity/branding-guidelines)), as drawn on the [design canvas](https://claude.ai/artifact/Q4EcjAYuBQrf6qErWo8ch5). "The same size" means one height, width and corner radius for all three choices.

#### Scenario: Dark mode

- **WHEN** the sign-in screen is shown in dark mode
- **THEN** each provider button uses its guide's dark variant

### Requirement: The choice responds at once and keeps focus

Pressing a choice SHALL show it pending and disable the other choices at once. Moving between the choice and the email form SHALL move focus to the email field on the way in and to the choice on the way back, without the screen changing height.

#### Scenario: Pressing a provider

- **WHEN** a person presses "Continue with Google"
- **THEN** that button shows it is working and the other two choices cannot be pressed

#### Scenario: Focus across the swap

- **WHEN** a person presses "Continue with email" and then goes back
- **THEN** focus is in the email field, and after going back on the choice's first button

### Requirement: Only providers that can complete are offered

A provider that is not configured in the environment SHALL NOT be shown, and no provider SHALL be shown on a host other than grnyte's configured origin, whose return address the providers do not know. With no provider left, the screen SHALL open on the email form with no choice step.

#### Scenario: Preview host

- **WHEN** the sign-in screen is opened on a preview or alias host that is not the configured origin
- **THEN** no choice step shows and the email form opens directly

#### Scenario: Local environment without Apple

- **WHEN** Apple is not configured in the environment
- **THEN** the choice shows Google and email only, with no gap where Apple would be

### Requirement: The last method used on this device is badged

The device SHALL remember the last method that signed in successfully on it, as `apple`, `google` or `email` and never the address, and SHALL mark that method's button with a "Last used" badge on the button's top corner, with enough space between the buttons that it touches no other, so it reads as belonging to that button, rendered with the page and kept out of the button's accessible name. The `email` badge SHALL mark "Continue with email" on the sign-in screen only, never on create account.

#### Scenario: Back after a Google sign-in

- **WHEN** a person who last signed in with Google on this device signs out and opens the sign-in screen
- **THEN** the Google button carries the "Last used" badge and the page does not shift when it appears

#### Scenario: Email on the create-account screen

- **WHEN** a person who last signed in with email opens the create-account screen
- **THEN** no button there carries the badge

#### Scenario: Failed attempt

- **WHEN** a person presses "Continue with Apple" and cancels
- **THEN** the badge still marks the method that last succeeded

### Requirement: Provider buttons are accessible

Each provider button SHALL have one text label that names the provider, with its logo hidden from assistive technology. Buttons SHALL wrap their label rather than clip it at 200 % zoom and at 375 px width. Errors SHALL be stated in text.

#### Scenario: Screen reader

- **WHEN** a screen reader reaches the Apple button
- **THEN** it announces "Continue with Apple" once as the button's name, with "Last used" at most as its description

#### Scenario: 200 % zoom

- **WHEN** the page is zoomed to 200 % on a 375 px wide screen
- **THEN** all three labels are fully visible

### Requirement: A failed sign-in hints at providers

The failed sign-in message on the email form SHALL be followed by the fixed hint "Signed up with Apple or Google? Go back and choose it there." with a control back to the choice, for every failed email sign-in, regardless of the address's account.

#### Scenario: Wrong password

- **WHEN** an email sign-in fails
- **THEN** the generic failure shows with the provider hint, identical for known and unknown addresses
