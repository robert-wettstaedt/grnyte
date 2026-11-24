# Spec Delta

## ADDED Requirements

### Requirement: Deletion takes re-authentication and the region's name

The deletion SHALL proceed only when the owner has re-authenticated for deleting this region, in the same session, and types the region's name exactly as shown. The screen SHALL ask for the re-authentication first and show the name field only once it is confirmed. Surrounding spaces SHALL be ignored. A name mismatch SHALL change nothing, SHALL mark the name field, and SHALL NOT spend the re-authentication. A missing, expired or spent re-authentication SHALL change nothing and ask for a new one.

#### Scenario: Wrong name

- **WHEN** the owner, confirmed, types a name that differs from the region's name
- **THEN** nothing is deleted, the name field shows the error, and the confirmation stays

#### Scenario: Wrong code

- **WHEN** the owner enters a wrong code before any name field is shown
- **THEN** nothing is deleted, the code field shows the error, and the name field stays hidden

#### Scenario: Confirm first, then the name

- **WHEN** the owner enters a correct code
- **THEN** the name field appears and nothing is deleted until the owner types the name and submits

#### Scenario: Code for another region

- **WHEN** the owner re-authenticated for deleting one region and submits the deletion of another
- **THEN** nothing is deleted and a new confirmation is asked for

## REMOVED Requirements

### Requirement: Deletion takes the password and the region's name

**Reason**: The password check is replaced by a re-authentication bound to the owner's session, the action and this region.

**Migration**: See "Deletion takes re-authentication and the region's name" in this spec and `auth/reauthentication`. A tab loaded before the deploy that submits a password is refused with "reload this page".
