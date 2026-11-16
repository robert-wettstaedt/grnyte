# Spec Delta

## ADDED Requirements

### Requirement: Linking or unlinking a provider sends a notice

Adding or removing Apple or Google on an account SHALL mail a notice to the account's address naming the provider, however the change was made.

#### Scenario: Google added

- **WHEN** Google is linked to an account
- **THEN** the account's address receives a notice that Google can now sign in to it

#### Scenario: Apple removed

- **WHEN** Apple is unlinked from an account
- **THEN** the account's address receives a notice that Apple can no longer sign in to it
