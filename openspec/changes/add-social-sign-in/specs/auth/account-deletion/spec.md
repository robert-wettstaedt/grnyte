# Spec Delta

## ADDED Requirements

### Requirement: Deleting an Apple-linked account revokes grnyte's Apple authorization

For an account with a linked Apple identity, the deletion screen SHALL lead with "Confirm with Apple". Confirming with Apple SHALL revoke grnyte's authorization at Apple, storing nothing from Apple, and the deletion mail SHALL say so. Confirming with the mailed code instead SHALL still allow the deletion, without revocation, and the missed revocation SHALL be recorded.

#### Scenario: Delete through Apple

- **WHEN** an Apple-linked person confirms with Apple and deletes their account
- **THEN** the account is deleted, grnyte no longer appears as connected in their Apple ID settings, and the deletion mail says Apple access was revoked

#### Scenario: Apple ID lost

- **WHEN** an Apple-linked person confirms with the mailed code and deletes their account
- **THEN** the account is deleted and the missed revocation is recorded

#### Scenario: Revocation fails at Apple

- **WHEN** Apple refuses or does not answer the revocation
- **THEN** the confirmation still counts, the failure is recorded, and the deletion mail does not claim a revocation
