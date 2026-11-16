# Spec Delta

## ADDED Requirements

### Requirement: Apple-linked accounts can confirm with Apple

For an account with a linked Apple identity, every re-authentication screen SHALL offer "Confirm with Apple" before any code is mailed, as well as beside the code field once one is. An Apple sign-in that passes the binding rules SHALL produce the same confirmation a correct code does, for the same account, session, action and target. Accounts without Apple SHALL NOT see the option.

#### Scenario: Deleting a region with Apple

- **WHEN** an Apple-linked region owner chooses "Confirm with Apple" on the region deletion screen and approves at Apple
- **THEN** they return to the deletion screen confirmed, no code is mailed, and the deletion proceeds when they submit within 5 minutes

#### Scenario: No Apple identity

- **WHEN** a person with only a password opens a re-authentication screen
- **THEN** only the mailed code is offered

#### Scenario: Blocked account deletion offers no Apple

- **WHEN** an Apple-linked owner of a shared region opens the account deletion screen
- **THEN** neither "Send code" nor "Confirm with Apple" is offered, and Apple is not contacted

#### Scenario: Choosing Apple without a code

- **WHEN** an Apple-linked person opens the account deletion screen and presses "Confirm with Apple" without pressing "Send code"
- **THEN** they go to Apple, no code is mailed, and the deletion does not run until they return confirmed and submit it

### Requirement: An Apple confirmation must be the account's own Apple ID

An Apple confirmation SHALL count only if the Apple identity that signed in is the one linked to this account. Any other Apple ID SHALL be refused, recorded in the auth event log, and produce no confirmation.

#### Scenario: Stolen session, attacker's Apple ID

- **WHEN** someone holding a stolen session chooses "Confirm with Apple" and signs in with their own Apple ID
- **THEN** no confirmation is produced and the attempt is recorded

### Requirement: An Apple confirmation is bound to its action and its session

An Apple confirmation SHALL count only if it completes within 10 minutes of being started, returns in the session that started it, and its identity proof was issued for this confirmation's action and target. A proof issued for another action, another target or another sign-in SHALL produce no confirmation. Apple may complete the confirmation without asking the person anything when the browser already holds an Apple session.

#### Scenario: Proof for another region

- **WHEN** an Apple confirmation started for deleting region A is completed while the request names region B
- **THEN** only a confirmation for region A exists, and deleting region B still asks for confirmation

#### Scenario: Late return

- **WHEN** Apple returns more than 10 minutes after the confirmation was started
- **THEN** no confirmation is produced and the screen offers to try again

#### Scenario: Another session

- **WHEN** an Apple confirmation started in one signed-in session returns in a different session of the same account
- **THEN** no confirmation is produced

### Requirement: Returning from Apple does not mail a code

When a person comes back to a re-authentication screen already confirmed with Apple, the screen SHALL show that it is confirmed and let them perform the action, and SHALL NOT mail a code.

#### Scenario: Back from Apple

- **WHEN** a person returns from "Confirm with Apple" to the account deletion screen
- **THEN** the screen reads as confirmed with the delete button available, and no code mail is sent

### Requirement: Confirm with Apple comes before a screen's fields

Because every re-authentication screen confirms first (`auth/reauthentication`, "A confirmation never runs the action by itself"), "Confirm with Apple" SHALL be offered only before a screen's own fields show, and returning confirmed SHALL reveal them without mailing a code. When a confirmation expires after something was typed, leaving for Apple loses that input; the mailed code keeps it.

#### Scenario: Back from Apple to the password screen

- **WHEN** an Apple-linked person returns confirmed from "Confirm with Apple" to the password change screen
- **THEN** the new-password field appears and no code is mailed

#### Scenario: Expired before submitting

- **WHEN** an Apple-linked person confirms, waits more than 5 minutes, then submits a new password
- **THEN** nothing changes and the screen asks for a confirmation again, offering Apple first

## MODIFIED Requirements

### Requirement: A screen that is already confirmed mails no code

A re-authentication screen SHALL first check whether an unspent confirmation for its account, session, action and target exists. When one does, it SHALL show that it is confirmed and offer the action, and SHALL NOT mail a code. When none does, it SHALL mail a code only when the person asks for one or submits the action unconfirmed, never on opening; for an account that can confirm with Apple, submitting unconfirmed SHALL instead offer "Confirm with Apple" and "Send code" again and mail nothing until "Send code" is pressed. A screen that serves several targets on one route SHALL start over for each target.

#### Scenario: Reload within 5 minutes

- **WHEN** a person confirms a code for deleting a region and reloads the deletion screen 2 minutes later
- **THEN** the screen reads as confirmed and no new code is mailed

#### Scenario: Nothing confirmed yet

- **WHEN** a person opens a re-authentication screen with no confirmation for it
- **THEN** no code is mailed, and a "Send code" control shows; pressing it mails a code and shows the code field

#### Scenario: Submitting without a confirmation

- **WHEN** a person without Apple submits account deletion or an ownership handover before confirming, or after the confirmation expired
- **THEN** the action is refused, a code is mailed, the code field shows with a line saying the action needs a confirmation, and after the code the screen reads as confirmed with what was already entered kept; the action runs on the next submit

#### Scenario: Confirmation expired on a screen with its own fields

- **WHEN** a person without Apple submits a new password after the confirmation expired
- **THEN** the change is refused, a code is mailed, and after the code the password field shows again with its value kept; the change runs only on the next submit

#### Scenario: Submitting without a confirmation, Apple-linked

- **WHEN** an Apple-linked person submits account deletion after the confirmation expired
- **THEN** the action is refused, "Confirm with Apple" and "Send code" show with a line saying the action needs a confirmation, no code is mailed, and after a code from there the screen reads as confirmed and the deletion runs when they press Delete

#### Scenario: Blocked account deletion

- **WHEN** a person opens account deletion while a region blocks it
- **THEN** the blocking regions show and no code can be requested

#### Scenario: Next recipient on the same screen

- **WHEN** a person confirmed handing a region to one member and then opens the handover to another member
- **THEN** the screen starts over unconfirmed for the second member
