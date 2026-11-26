# Spec Delta

## MODIFIED Requirements

### Requirement: Writes need a signed-in session

The write endpoint SHALL reject a request without a valid session token. Where zero-cache carries
writes, it SHALL do so in a way that keeps the client's pending writes for after it signs in again,
rather than discarding them. In a build that runs PowerSync, the client SHALL ask for a new token
once and send the write again under the same write id; if that is refused too, it SHALL report the
write as failed, as it reports any refused write, and SHALL NOT apply it later.

#### Scenario: An expired token

- **WHEN** a write arrives with an expired token
- **THEN** the server answers unauthorized, and the client asks for a new token instead of dropping
  the write

#### Scenario: A PowerSync build cannot renew the token

- **WHEN** a person saves a favorite in a PowerSync build and the write is refused as unauthorized
  again after a new token was asked for
- **THEN** the button returns to unsaved, a toast reports the failure, and the write is not applied
  after the next sign-in
