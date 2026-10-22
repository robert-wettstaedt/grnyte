# Spec Delta

## RENAMED Requirements

- FROM: `### Requirement: The last admin of a shared region cannot delete their account`
- TO: `### Requirement: The owner of a shared region cannot delete their account`

## MODIFIED Requirements

### Requirement: The owner of a shared region cannot delete their account

Deletion SHALL be refused while the person owns a region that has at least one other active member, whether or not that region has other admins. The refusal SHALL name every such region and ask the person to hand ownership over first. It SHALL change nothing.

#### Scenario: Only admin of a region with members

- **WHEN** the person owns a region with other active members, as its only admin, and submits the deletion
- **THEN** the deletion is refused, the screen lists that region with a prompt to hand it over, and no data changes

#### Scenario: Another admin exists

- **WHEN** the person owns a region that has a second active admin
- **THEN** the region still blocks the deletion until ownership is handed over

#### Scenario: Admin who is not the owner

- **WHEN** the person is an admin, but not the owner, of a region with other active members
- **THEN** the region does not block the deletion

#### Scenario: Shown before submitting

- **WHEN** the person opens the deletion screen while a region would block it
- **THEN** the screen names the region before they enter their password
