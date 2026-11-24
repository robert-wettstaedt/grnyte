# Spec Delta

## Purpose

Decides which Supabase access tokens grnyte and its sync servers accept as a signed-in person, so a
token is trusted only when the project's own signing key produced it and no deployed component holds
a key that could mint one.

## ADDED Requirements

### Requirement: A token is accepted only under a configured signing key

The app SHALL accept an access token only when its signature verifies under a key the deployment has
configured: the project's published JWKS for asymmetric tokens (ES256, RS256) and, only while it is
configured, the legacy shared secret for HS256. The token's header SHALL pick between configured keys
and never select a key type its algorithm does not match.

#### Scenario: Asymmetric token from the project

- **WHEN** a request carries an ES256 token signed by a key in the project's JWKS, addressed to `authenticated`, with a `sub` and the `authenticated` role
- **THEN** the request is treated as that person

#### Scenario: Asymmetric token from a foreign key

- **WHEN** a request carries an ES256 token signed by a key that is not in the project's JWKS
- **THEN** the request is treated as signed out

#### Scenario: Header names an algorithm the key does not match

- **WHEN** a token claims RS256 or ES256 in its header but carries an HMAC signature, or claims HS256 and is signed with the JWKS public key used as an HMAC secret
- **THEN** the request is treated as signed out

### Requirement: HS256 is refused once the legacy secret is removed

When the deployment has no legacy secret configured, the app SHALL refuse every HS256 token, whatever
key signed it.

#### Scenario: HS256 after the migration

- **GIVEN** the deployment configures only the JWKS
- **WHEN** a request carries an HS256 token signed with the former legacy secret
- **THEN** the request is treated as signed out

#### Scenario: Both accepted during the migration

- **GIVEN** the deployment configures both the legacy secret and the JWKS
- **WHEN** one request carries an HS256 token signed with the secret and another an ES256 token from the JWKS
- **THEN** both are treated as their person

### Requirement: Claims are checked whatever signed the token

The app SHALL require audience `authenticated`, an `exp`, a non-empty string `sub` and role
`authenticated`, and SHALL refuse a token whose account is still contested (flagged because another
person's unconfirmed sign-up claimed the address), for asymmetric and HS256 tokens alike. An API key presented as a session SHALL never be accepted.

#### Scenario: Service role token signed by the project

- **WHEN** a request carries a correctly signed token with role `service_role`
- **THEN** the request is treated as signed out

#### Scenario: Asymmetric token for a contested account

- **WHEN** a request carries a valid ES256 token whose `app_metadata` marks the sign-up as contested
- **THEN** the request is treated as signed out

### Requirement: An unreachable JWKS does not sign anyone out

When the JWKS cannot be fetched, the app SHALL treat the request as anonymous for that request only,
report it as a backend outage rather than a failed sign-in, and keep the person's session cookies.
A token whose key id is absent from a JWKS that was fetched SHALL still be refused as invalid.

#### Scenario: JWKS endpoint down

- **WHEN** a signed-in person loads a page while the JWKS endpoint times out
- **THEN** the page shows the backend-unavailable state instead of sending them to sign in, and their next request after the endpoint recovers is signed in

#### Scenario: Sync query during a JWKS outage

- **WHEN** zero-cache forwards a token to the query endpoint while the JWKS cannot be fetched
- **THEN** the endpoint answers with a status zero-cache retries, rather than one that ends sync

#### Scenario: Sync write during a JWKS outage

- **WHEN** zero-cache forwards a token to the mutate endpoint while the JWKS cannot be fetched
- **THEN** the endpoint answers so that the client asks for a fresh token and keeps its queued writes

### Requirement: No deployed component holds a key that can mint a token

After the migration, no deployed component SHALL be configured with the legacy shared secret. The app
and the PowerSync service SHALL verify asymmetric tokens through the project's JWKS URL; zero-cache
SHALL hold no secret (at most a public JWKS URL).

#### Scenario: Sync servers after the migration

- **WHEN** the environments of the app, zero-cache and PowerSync are listed after the final step
- **THEN** none holds a JWT secret, and PowerSync accepts an ES256 session from the project

### Requirement: Synced data reaches only a verified token

The sync server SHALL send a client no rows and apply no write unless that client's token has been
verified against the project's keys and its subject is the user the connection claims, before any
row is sent, including rows already held for an existing client group (the set of a person's tabs
on one device, which share one synced store on the server). grnyte's query and mutate endpoints
verifying the token is not enough on its own.

#### Scenario: Forged token on a new connection

- **WHEN** a client connects to the sync server with a token signed by a key the project does not use
- **THEN** it receives no rows

#### Scenario: Forged token on an existing client group

- **GIVEN** a client group that has already synced a person's rows
- **WHEN** a client connects with that client group's id, that person's user id and a forged token
- **THEN** it receives none of the rows already held for that client group

#### Scenario: Forged write

- **WHEN** a client with a forged token sends a mutation
- **THEN** the mutation is refused and nothing is written

#### Scenario: Another person's valid token on an existing client group

- **GIVEN** a client group that has already synced a person's rows
- **WHEN** a second person connects as a new client of that group, claiming the first person's user id, with the second person's own valid token
- **THEN** the connection is refused and receives none of the group's rows

### Requirement: Both token kinds are accepted for the whole transition

Every component that verifies tokens, except the Zero sync server, SHALL accept both HS256 tokens
under the legacy secret and asymmetric tokens under the JWKS from before the project starts issuing
asymmetric tokens until every HS256 token issued before that has expired, so no person with a live
session loses it at any step. A device that slept past that point recovers by refreshing onto an
asymmetric token.

#### Scenario: Rotation

- **WHEN** the project switches from issuing HS256 to issuing ES256 tokens
- **THEN** a person holding an HS256 token and a person holding a fresh ES256 token both keep browsing and using PowerSync

### Requirement: The Zero sync server switches keys at the rotation

The Zero sync server accepts one token kind at a time and SHALL switch from the legacy secret to the
JWKS within 10 minutes of the rotation. A client whose token it refuses SHALL keep its queued writes
and sync again after its next token refresh, without signing in again.

#### Scenario: Zero across the rotation

- **WHEN** the project switches from issuing HS256 to issuing ES256 tokens and the Zero sync server switches to the JWKS
- **THEN** a person holding an HS256 token and a person holding a fresh ES256 token both sync on Zero again at the latest after their next token refresh, without losing queued writes

#### Scenario: Device asleep across the removal of HS256

- **GIVEN** a device whose stored HS256 access token expired while HS256 was being removed, with a live refresh token
- **WHEN** it wakes and syncs
- **THEN** its token is refused, it refreshes onto an ES256 token without signing in again, and sync resumes
