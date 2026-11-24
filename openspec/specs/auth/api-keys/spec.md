# auth/api-keys Specification

## Purpose
Fixes which Supabase API key each part of grnyte holds and where the secret key may travel, so the
key that bypasses row-level security never reaches a browser or a data query, and GoTrue's per-IP
limits count the person rather than grnyte's server.

## Requirements

### Requirement: The browser holds only the publishable key

The client bundle SHALL contain the project's publishable key and SHALL NOT contain the secret key or
any value derived from it. Every browser request to Supabase SHALL send the publishable key as
`apikey`, including the direct staging upload to Storage.

#### Scenario: Built client output

- **WHEN** the app is built with a known secret key value
- **THEN** no file in the client output contains that value

#### Scenario: Staging upload

- **WHEN** a signed-in person uploads a photo
- **THEN** the upload request carries the person's access token as `Authorization: Bearer` and the publishable key as `apikey`

### Requirement: The secret key travels only as `apikey`

Server code SHALL send a new-format secret key (`sb_secret_`) only in the `apikey` header and never
as an `Authorization: Bearer` value, and only from the server. A legacy service-role key held in the
same setting keeps its Bearer, the only credential older gateways accept.

#### Scenario: Auth call with the secret key

- **WHEN** the server makes a GoTrue call with an `sb_secret_` key
- **THEN** the request carries the secret key as `apikey` and no `Authorization` header

#### Scenario: Admin and Storage call with the secret key

- **WHEN** the server deletes a user or sweeps the staging bucket with an `sb_secret_` key
- **THEN** the request carries the secret key as `apikey` and no `Authorization` header holding the secret key

#### Scenario: Legacy key during the transition

- **GIVEN** the secret-key setting still holds the legacy service-role key
- **WHEN** the server deletes a user or sweeps the staging bucket
- **THEN** the request carries that key both as `apikey` and as `Authorization: Bearer`, and succeeds

### Requirement: The auth-only server client reaches GoTrue and nothing else

The server SHALL make secret-key GoTrue calls on a person's behalf through one auth-only client that
exposes only the GoTrue operations a person's own sign-up and sign-in need, with no user
administration and no database, RPC, Storage or Functions access.

#### Scenario: Data access is unreachable

- **WHEN** server code obtains the auth-only client
- **THEN** it has no way to run a table query, an RPC, a Storage or a Functions call through it

#### Scenario: Admin operations are unreachable

- **WHEN** server code obtains the auth-only client
- **THEN** it has no way to list, create, update or delete users or generate sign-in links through it

### Requirement: GoTrue sees the person's own address

Every call through the auth-only client SHALL send `Sb-Forwarded-For` set to the client address the
server's platform reports for the request. It SHALL never copy the value from a header the client
sent, such as `X-Forwarded-For` or `Sb-Forwarded-For`.

#### Scenario: Client sends its own forwarding headers

- **GIVEN** the platform reports the client address `198.51.100.7`
- **WHEN** a request carrying `X-Forwarded-For: 203.0.113.1` and `Sb-Forwarded-For: 203.0.113.9` triggers a GoTrue call
- **THEN** GoTrue receives `Sb-Forwarded-For: 198.51.100.7`

#### Scenario: Forged header on a direct publishable-key call

- **GIVEN** IP address forwarding is enabled for the project
- **WHEN** someone calls GoTrue directly with the publishable key and a forged `Sb-Forwarded-For`
- **THEN** GoTrue applies its per-IP limit to the caller's real address, not the forged one

#### Scenario: Limit follows the forwarded address

- **GIVEN** IP address forwarding is enabled for the project
- **WHEN** secret-key verify calls forwarding one address exhaust GoTrue's verify limit
- **THEN** a secret-key verify call forwarding a second address is still answered rather than refused with 429

### Requirement: Legacy API keys are retired

After the migration, every grnyte component SHALL use the publishable or secret key, and the
project's legacy `anon` and `service_role` keys and its legacy JWT secret SHALL be disabled.

#### Scenario: Legacy anon key after retirement

- **WHEN** someone calls the project's auth settings endpoint with the former `anon` key
- **THEN** Supabase refuses the request

#### Scenario: Deployed configuration check

- **WHEN** the deployed configuration check runs against production
- **THEN** it reports the configured public key as a publishable key and the project's JWKS as holding an asymmetric signing key
