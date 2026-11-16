# Spec Delta

## Purpose

Replaces the links in grnyte's account mails with short codes a person types or autofills, so confirming an address, resetting a password and changing an email work inside the installed app and on any device.

## ADDED Requirements

### Requirement: Account mails carry an 8-digit code, not a link

The sign-up confirmation, password reset and email change mails SHALL carry an 8-digit numeric code, shown in the subject and in the body, and SHALL NOT carry a link that completes the step. Every code SHALL stop working 10 minutes after it was sent and SHALL work once.

#### Scenario: Sign-up confirmation mail

- **WHEN** a person creates an account
- **THEN** the mail they receive has the code in its subject and body and no confirmation link

#### Scenario: Code after 10 minutes

- **WHEN** a person enters a code 11 minutes after it was sent
- **THEN** the step is refused with an "expired" message and a way to send a new code

#### Scenario: Code used twice

- **WHEN** a code that already completed a step is entered again
- **THEN** it is refused and nothing changes

### Requirement: One code entry behaves the same everywhere

Every screen that asks for a mailed code SHALL use one code field: a single labelled numeric input that the device can fill from a received mail, a resend control that is disabled for 60 seconds after each send and shows the seconds left, an expired state, and errors as text. The field SHALL know its code's length (8 digits for these mails, 6 for a re-authentication code), say it in its copy, and submit on its own once that many digits are present, with a "Continue" button below it as well.

#### Scenario: Pasted code that does not submit

- **WHEN** a pasted code fills the field without triggering the automatic submit
- **THEN** pressing "Continue" submits it

#### Scenario: Autofill on an Apple device

- **WHEN** the code mail arrives in Apple Mail while the code screen is open in Safari
- **THEN** the keyboard offers the code and accepting it fills and submits the field

#### Scenario: Resend countdown

- **WHEN** a person has just been sent a code
- **THEN** the resend control is disabled and counts down from 60 seconds, and pressing it afterwards sends a new code and restarts the countdown

#### Scenario: Wrong code

- **WHEN** a person submits 8 digits that are not the current code
- **THEN** the field shows a text error and stays editable

#### Scenario: Android

- **WHEN** the code mail arrives on an Android phone
- **THEN** nothing fills the field for the person; they copy the code from the mail or type it, and the field submits at the 8th digit

### Requirement: Guessing a mailed code through grnyte stops after 5 tries

grnyte SHALL count every try at a sign-up, reset or email-change code per address and code type, before it asks the authentication service, and SHALL refuse a 6th try with a message to request a new code, without checking it. A new code of that type actually sent to that address SHALL reset the count; a send the authentication service refuses (for its send limit or any other reason) leaves the old code live and SHALL leave the count as it was. A correct code SHALL clear it.

#### Scenario: Sixth try

- **WHEN** someone enters 5 wrong codes for an address's sign-up confirmation and then the right one
- **THEN** the 6th try is refused with "request a new code", and the account stays unconfirmed

#### Scenario: Resend resets the count

- **WHEN** a person is locked out after 5 wrong tries and presses Resend
- **THEN** the new code is accepted on the first try

#### Scenario: A refused resend does not reset the count

- **WHEN** someone makes 5 wrong tries, then presses Resend twice within a minute so the second send is refused for the send limit, and tries again
- **THEN** the try is still refused until a new code is actually sent

#### Scenario: The reset step guesses the confirmation code too

- **WHEN** 5 wrong tries were made at an unconfirmed address's sign-up code, and someone then tries the reset step for that address
- **THEN** the try is refused until a new code is sent

### Requirement: Sign-up is confirmed by entering the code

After creating an account, the create-account screen SHALL switch to code entry for the address just used. A correct code SHALL confirm the address and sign the person in, and SHALL lead to the profile step.

#### Scenario: Confirming a fresh sign-up

- **WHEN** a person creates an account and enters the mailed code
- **THEN** the address is confirmed, they are signed in, and they land on the profile step

### Requirement: A second sign-up for an unconfirmed address marks it contested

Before any second mail is sent to an account that has not confirmed its address, whether by another sign-up, a forgot-password request or a resend, the account SHALL be marked contested. If the mark cannot be stored, no mail SHALL be sent and the failure SHALL be shown. Otherwise the answer on screen SHALL be the same as for a fresh sign-up. The two resends of the next requirement are the only exceptions.

#### Scenario: A stranger signed up first

- **WHEN** someone signs up with an address, and later the owner of that address signs up with it too
- **THEN** the account is marked contested, one new code goes to the address, and the owner sees the normal "enter the code" screen

#### Scenario: Marking fails

- **WHEN** the contested mark cannot be stored
- **THEN** no mail is sent and the screen shows that something went wrong and to try again

### Requirement: Two resends leave an unconfirmed account unmarked

The Resend on the code screen that a sign-up or a sign-in just opened SHALL NOT mark the account contested when it carries the token that sign-up or sign-in returned for this address. The resend that follows a sign-in with the account's right password SHALL NOT mark it either. Any other resend SHALL. Every resend SHALL pass the same bot checks as sign-up (a fresh proof-of-work solution and the hidden field left empty), token or not.

#### Scenario: Resend right after signing up

- **WHEN** a person signs up, waits for the countdown and presses Resend on the same screen
- **THEN** a new code is sent, the account is not marked contested, and confirming it leads straight to the profile step

#### Scenario: Resend without the sign-up's token

- **WHEN** a resend for an unconfirmed address arrives without a valid token for that address
- **THEN** the account is marked contested before the code is sent

#### Scenario: Resend by a script

- **WHEN** a resend arrives with a valid token but without a fresh proof-of-work solution
- **THEN** it is refused and nothing is sent

### Requirement: Confirming a contested account replaces its password

Entering the confirmation code of a contested account SHALL replace the account's password with one nobody knows, clear the mark, and lead to a required "choose your password" step before the profile step. While the mark is set, no session of that account SHALL be accepted, and the password chosen by whoever signed up first SHALL NOT sign in afterwards.

#### Scenario: Stranger's password after the owner confirms

- **WHEN** a stranger signs up with an address, the owner signs up with it again, and the owner confirms with the code
- **THEN** the owner must choose a password, and the stranger's password is refused at sign-in

#### Scenario: Leaving at the password step

- **WHEN** the owner confirms a contested account and closes the app before choosing a password
- **THEN** the account stays confirmed with an unknown password, and forgot password reaches it

#### Scenario: Replacing the password fails

- **WHEN** the owner confirms a contested account by code and the password cannot be replaced
- **THEN** the owner is sent to forgot password for that address, and the stranger's password still does not sign in

#### Scenario: A plain sign-up confirms normally

- **WHEN** an account that was never marked contested is confirmed
- **THEN** no password step appears and the person goes straight to the profile step

### Requirement: Password reset is completed by code

Forgot password SHALL mail a code to a confirmed account, or a confirmation code to an unconfirmed one, and switch the screen to code entry. Either code SHALL be accepted on that screen. A correct code SHALL lead to choosing a new password on the same screen; for a contested account it SHALL first replace the stranger's password as on confirmation. The new password SHALL meet the password policy and SHALL sign out every other session of the account.

#### Scenario: Resetting a password

- **WHEN** a person requests a reset, enters the code and chooses a new password
- **THEN** the new password works, the old one does not, and their other devices are signed out

#### Scenario: Account without a password

- **WHEN** a person whose account has never had a password completes a reset
- **THEN** the chosen password becomes the account's first password

#### Scenario: Reset for an unconfirmed address

- **WHEN** someone requests a reset for an address whose account never confirmed, and the owner enters the confirmation code that arrives
- **THEN** the address is confirmed, the stranger's password stops working, and the owner chooses a new password on the same screen

### Requirement: Only a session a code just made chooses a password without re-authentication

Choosing a password through the reset or the contested step SHALL be accepted only on a session that a mailed code made within the last 10 minutes. Any other session SHALL go through re-authentication to change the password.

#### Scenario: Setting a password from an ordinary session

- **WHEN** a session made by signing in with a password asks to set a new password through the reset step
- **THEN** it is refused, and nothing changes

### Requirement: Email change is completed by codes to both addresses

Changing the email in settings SHALL mail a code to the current address and a code to the new one, and the settings screen SHALL ask for them one at a time: first the current address's code, then the new address's, each step with its own resend. The address SHALL change only when both codes are correct. Every other session of the account SHALL then be signed out.

#### Scenario: One code at a time

- **WHEN** a person asks to change their email
- **THEN** the screen asks only for the code sent to the current address, and after a correct one asks for the code sent to the new address

#### Scenario: Both codes entered

- **WHEN** a person enters the code from each address
- **THEN** the account's address changes, and other devices are signed out

#### Scenario: Resend on the second step

- **WHEN** a person who entered the current address's code presses resend on the new address's step
- **THEN** both addresses get a new code, the screen goes back to asking for the current address's code and says so, and the address changes only after both new codes

#### Scenario: Only the current address's code

- **WHEN** a person enters the code sent to the current address and leaves before entering the other
- **THEN** the address does not change

### Requirement: Email change to a taken address does not reveal the account

An email change to an address that already belongs to another account SHALL show the same "check both inboxes" screen as any other change, SHALL change nothing, and SHALL mail the taken address a notice that someone tried to use it, instead of a code.

#### Scenario: Address in use

- **WHEN** a person changes their email to an address another account uses
- **THEN** their screen reads as for any change, their address stays, and the other address receives the "already has an account" notice and no code

### Requirement: Real failures are shown, the wording stays non-enumerating

Sign-up, resend, forgot password and email change SHALL do their work with the authentication service and the mailer before they answer, and SHALL show a real failure instead of a false success: the authentication service unreachable, the mail quota or send limit reached, or the sign-up refused by its hook. When nothing failed, the answer for an existing, unconfirmed, taken or unknown address SHALL read the same. They SHALL NOT be required to take the same time.

#### Scenario: Mail quota spent

- **WHEN** a person asks for a reset code while the mailer's daily quota is spent
- **THEN** the screen says the mail could not be sent and to try again later, instead of "check your inbox"

#### Scenario: Forgot password for an unknown address

- **WHEN** forgot password is requested for an address with no account and nothing fails
- **THEN** the screen reads exactly as for an existing address

### Requirement: The authentication service limits code steps per person

grnyte's server-side code calls (confirming a sign-up, reset or email change, and sending those codes) and its password sign-ins SHALL reach the authentication service with the person's own address, so its per-address limits count each person, not grnyte's server as a whole. An address claimed by the caller on a direct call to the service SHALL NOT be trusted. Every rate-limit refusal from the authentication service SHALL alert admins the same day.

#### Scenario: One person hammering codes

- **WHEN** one person makes more code calls through grnyte than the authentication service allows from one address
- **THEN** that person is refused with "try again later", and another person confirming a code at the same time is served

#### Scenario: A link mailed before the switch to codes

- **WHEN** a person follows a confirmation link mailed before the switch, while it is still valid
- **THEN** it works as before, the one confirmation not forwarded with the person's address

#### Scenario: A forged address on a direct call

- **WHEN** someone calls the authentication service directly with the published key and claims a different address in a header
- **THEN** the service still counts their real address

#### Scenario: The service refuses for its rate limit

- **WHEN** the authentication service answers one of grnyte's code calls with a rate-limit refusal
- **THEN** the person sees a "try again later" message and admins are alerted that day
