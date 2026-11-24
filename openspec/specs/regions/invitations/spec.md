# regions/invitations Specification

## Purpose
Defines what a person sees on an invitation when they hold its link but are signed in with an address other than the one invited, so the strict address check never reads as a broken invitation.

## Requirements

### Requirement: An address mismatch says how to proceed

When a signed-in account opens an invitation for a different address, the screen SHALL say which address is signed in and `This invite is for <address>. Continue with that email, or ask <inviter> to invite the address you use.`, saying `an admin of <region>` in place of an inviter whose account no longer exists, SHALL offer to sign out and continue with the invited address, and SHALL NOT accept the invitation for the signed-in account.

#### Scenario: Apple relay address

- **WHEN** a person signed in with an Apple private relay address opens an invitation sent to their real address
- **THEN** the screen names the invited address and the inviter, offers to switch accounts, and accepting is not offered

#### Scenario: Inviter deleted their account

- **WHEN** the mismatch screen is shown for an invitation whose inviter no longer has an account
- **THEN** the copy asks an admin of the invitation's region instead of an inviter and still names both addresses

#### Scenario: Accepting anyway

- **WHEN** the signed-in account sends an accept for an invitation addressed elsewhere
- **THEN** the invitation stays pending and the account does not join the region
