# Spec Delta

## Purpose

Makes a signed-out or revoked session stop working for anything that changes an account or its data, keeps a sign-in alive until it is revoked, and lets a person sign their other devices out.

## ADDED Requirements

### Requirement: A revoked session cannot act

Every auth, account and admin action, every app-API request and every synced write SHALL be treated as signed out when its session no longer exists at the authentication service, even while its access token has not expired. Page loads and synced reads SHALL NOT be checked and MAY continue until the access token expires.

#### Scenario: Signed out elsewhere

- **WHEN** a person signs out every other device, and one of those devices then saves a change
- **THEN** the change is refused as signed out, and that device clears its data and returns to the start page instead of retrying the change

#### Scenario: Account action on a revoked session

- **WHEN** a device whose session was revoked opens settings and changes its email
- **THEN** the request is refused, the device clears its sign-in and its data and returns to the start page, with no error text left on the settings screen

#### Scenario: The authentication service is briefly down

- **WHEN** a device's token needs refreshing while the authentication service answers with a server error or a rate-limit refusal
- **THEN** the device stays signed in and tries again later; only a refusal saying the session or its refresh token is gone signs it out

#### Scenario: Live session

- **WHEN** a request carries a valid token whose session still exists
- **THEN** it is served as that person

### Requirement: A failed session check is not a sign-out

Only a session that is gone at the authentication service SHALL count as signed out. When the check itself cannot be made (the database read fails or times out), the request SHALL fail without signing anyone out or deleting anything. For a synced write the check SHALL add no new way to fail: it reads in the same database step that already loads the person, so a failed read behaves exactly as a failed load of the person does today.

#### Scenario: Database blip

- **WHEN** the session check's read fails while a person saves a change
- **THEN** the save fails as it would if the database had failed to load the person, and the person stays signed in

### Requirement: The device that changes the password stays signed in

A password change SHALL leave the device that made it signed in, including its other tabs in the same browser, while every other device is signed out at its next write.

#### Scenario: Two tabs and a laptop

- **WHEN** a person changes their password in one tab on their phone, with a second tab open there and a laptop signed in
- **THEN** both phone tabs keep working without signing in again, and the laptop is signed out at its next write

### Requirement: A sign-in has no time limit

A session SHALL stay signed in, however long ago its sign-in was and however long it was idle, until it is revoked (a password change, reset or email change, signing out other devices, or signing out). No check and no cleanup SHALL end a session for its age.

#### Scenario: A year later

- **WHEN** a person who signed in a year ago and never revoked that session saves a change
- **THEN** it is saved and they stay signed in

### Requirement: Other devices are signed out after account changes

A password change, a password reset and an email change SHALL each end every other session of the account and keep the session that made the change, without asking for a re-authentication of their own.

#### Scenario: Password changed on the phone

- **WHEN** a person changes their password on their phone while signed in on a laptop
- **THEN** the laptop is signed out and the phone stays signed in

### Requirement: A person can see their signed-in devices and sign out one

The settings screen SHALL list every live session of the account as a device, showing when it was signed in and when it was last active, and marking the one in use. It SHALL NOT show an IP address, a place derived from one, or the browser. Each device other than the current one SHALL offer "Sign out", which ends that session at once without asking for a re-authentication; the current device SHALL NOT offer it.

#### Scenario: Two devices

- **WHEN** a person signed in on a phone and a laptop opens the list on the laptop
- **THEN** both are listed, the laptop is marked as this device, and only the phone offers "Sign out"

#### Scenario: Signing out the phone

- **WHEN** they press "Sign out" on the phone's row
- **THEN** the phone's session ends at once, it disappears from the list, the phone's next change or account action is refused as signed out, and the laptop stays signed in

#### Scenario: Another account's session

- **WHEN** a request asks to sign out a session that belongs to a different account
- **THEN** nothing is signed out

### Requirement: A person can sign out their other devices

The settings screen SHALL offer "Sign out other devices", which ends every session of the account except the current one at once, without asking for a re-authentication, and confirms it on screen. Any live session of the account can do this, as it can at the authentication service directly; it cannot take the account.

#### Scenario: Pressing the button

- **WHEN** a person presses "Sign out other devices"
- **THEN** every other session ends, this device stays signed in, no code is asked, and the screen confirms it

#### Scenario: A revoked session presses it

- **WHEN** a device whose session was already revoked asks to sign out other devices
- **THEN** it is refused as signed out and no other session ends
