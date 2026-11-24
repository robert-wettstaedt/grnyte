# Spec Delta

## Purpose

Gives a native client the same server-owned auth steps the web has, through JSON endpoints that authenticate with a Bearer token only, so one set of rules governs both clients.

## ADDED Requirements

### Requirement: Every server-owned auth step has an app endpoint

Each auth step the web performs through grnyte's server, as defined by `auth/email-codes`, `auth/sign-up-protection`, `auth/password-policy`, `auth/profile-completion`, `auth/reauthentication`, `auth/account-deletion` and `auth/sessions` (`harden-auth-codes`) and `auth/sign-in-methods` (`add-social-sign-in`), SHALL also be reachable as a JSON endpoint under `/api/app/v1/`.

#### Scenario: Creating an account from the app

- **WHEN** a native client posts an email, a password and a solved proof-of-work challenge to the sign-up endpoint
- **THEN** the account is created exactly as from the web form, and the confirmation code is mailed

#### Scenario: A step with no endpoint

- **WHEN** a native client needs password sign-in, token refresh or sign-out
- **THEN** it calls the authentication service directly, and grnyte offers no endpoint for it

### Requirement: An endpoint applies exactly the web's rules

An app endpoint and its web counterpart SHALL accept the same inputs, refuse the same inputs with the same message keys, and make the same changes. A rule added to one SHALL apply to the other without a second edit.

#### Scenario: Breached password

- **WHEN** a native client sets a new password that the password policy refuses
- **THEN** the endpoint refuses it with the same message key the web form shows, and nothing is stored

#### Scenario: Contested sign-up confirmed from the app

- **WHEN** a native client confirms a sign-up code for an account marked contested
- **THEN** the answer requires choosing a new password, as on the web, and the stranger's password no longer works

### Requirement: An unconfirmed account gets a fresh code after a password sign-in

Because a native client signs in with a password directly at the authentication service, the app API SHALL offer the web's unconfirmed sign-in step: given the address and the right password of an account whose address is not confirmed, it SHALL mail a new confirmation code without marking the account contested; with a wrong password it SHALL send nothing and answer like any failed sign-in.

#### Scenario: Unconfirmed account after a password sign-in

- **WHEN** a native client's password sign-in is told the address is not confirmed and it asks the app API for a fresh code with the same password
- **THEN** a code is mailed and the account is not marked contested, as on the web

#### Scenario: The account was confirmed after all

- **WHEN** a native client asks for a fresh code with the right password of an account whose address is already confirmed
- **THEN** the answer says the account is confirmed, no code is mailed, and no session is left open by the request

### Requirement: Steps that create a session return it in the body

An endpoint whose step signs the person in, or replaces their session, SHALL return the new access and refresh token in its JSON response and SHALL NOT set a cookie.

#### Scenario: Reset code confirmed

- **WHEN** a native client confirms a correct reset code
- **THEN** the response carries a session the client can store, and no cookie

#### Scenario: Password changed

- **WHEN** a native client changes the password after re-authenticating
- **THEN** the response carries a fresh session for this device, and the account's other sessions are ended

### Requirement: The Bearer token is the only session on the app API, and only there

An app endpoint that needs a signed-in caller SHALL read the caller only from an `Authorization: Bearer` header carrying an access token that verifies against the project's signing key, SHALL ignore cookies entirely, and SHALL answer 401 without one. A Bearer token SHALL NOT authenticate any request outside `/api/app/` and the sync endpoints that already verify their own header.

#### Scenario: Cookie without a Bearer token

- **WHEN** a request to an app endpoint carries a valid web session cookie and no `Authorization` header
- **THEN** it is answered 401 and nothing changes

#### Scenario: Valid Bearer token

- **WHEN** a request carries a valid Bearer token for a live session
- **THEN** it is served as that person

#### Scenario: Expired token

- **WHEN** a request carries an expired access token
- **THEN** it is answered 401 and the server does not try to refresh it

#### Scenario: Bearer token on a web page

- **WHEN** a request to `/settings` carries a valid Bearer token and no cookie
- **THEN** it is treated as signed out

### Requirement: A revoked sign-in is refused

An app endpoint SHALL refuse a Bearer token whose session no longer exists at the authentication service with 401, even while the token itself has not expired.

#### Scenario: Signed out elsewhere

- **WHEN** a person signs out their other devices on the web, and the app then calls an endpoint with its unexpired token
- **THEN** the call is answered 401 and nothing changes

### Requirement: An outage is not a sign-out

When grnyte cannot check a Bearer token or its session because the signing keys or the session store cannot be reached, an app endpoint SHALL answer 503 with `auth_serviceUnavailable`, change nothing, and SHALL NOT answer 401, so the app keeps its session.

#### Scenario: Signing keys unreachable

- **WHEN** the authentication service's signing keys cannot be fetched and the app calls an endpoint with a valid token
- **THEN** the answer is 503 `auth_serviceUnavailable` in JSON, and the app stays signed in

#### Scenario: Session check fails

- **WHEN** reading the token's session fails with a database error
- **THEN** the answer is 503 `auth_serviceUnavailable` in JSON, not a server error page and not 401

### Requirement: App endpoints never set cookies

No response under `/api/app/` SHALL carry a `Set-Cookie` header, whatever the request carried and whichever branch answered.

#### Scenario: Request with web cookies attached

- **WHEN** a request to an app endpoint carries web session cookies close to expiry and a valid Bearer token
- **THEN** the response carries no `Set-Cookie` header

### Requirement: App endpoints send no CORS headers

App endpoints SHALL NOT send `Access-Control-Allow-Origin`, SHALL NOT answer a CORS preflight with permission, and SHALL be unusable from a script on another origin.

#### Scenario: Preflight from another origin

- **WHEN** a browser on another origin sends an `OPTIONS` preflight for an app endpoint
- **THEN** the answer grants nothing and carries no `Access-Control-Allow-Origin`

### Requirement: App endpoints accept only JSON bodies

An app endpoint that changes anything SHALL accept only a `POST` with `Content-Type: application/json` and SHALL refuse any other content type before reading the body, so a cross-site form or `text/plain` post cannot reach a handler. The handoff's provider return is not an app endpoint: it is the web's return address.

#### Scenario: Cross-site text/plain post

- **WHEN** a page on another origin posts `text/plain` to an app endpoint while the person's browser holds a web session
- **THEN** the request is refused and nothing changes

### Requirement: The app API is the Bearer exception to the cross-site refusal

Because the app API reads no cookie, it SHALL be exempt from refusing cookie-authenticated cross-site requests (`auth/cross-site-requests`); its JSON-only and Bearer-only rules SHALL keep cross-site posts out instead.

#### Scenario: Cross-site JSON post from a native client

- **WHEN** a native client posts JSON with a Bearer token and its HTTP stack sends `Sec-Fetch-Site: cross-site`
- **THEN** the request is served

### Requirement: A caller without a profile is held at the profile step

A Bearer caller whose account has no profile SHALL be refused with a `profile_required` answer by every app endpoint except the profile step, re-authentication, new password and sign out other devices.

#### Scenario: Deleting before finishing the profile

- **WHEN** an account without a profile asks for its deletion preview or deletes itself from the app
- **THEN** it is refused with `profile_required`; an account never finished is removed by the unconfirmed-account cleanup after 7 days (user decision, 2026-11-16)

#### Scenario: Linking before finishing the profile

- **WHEN** an account without a profile asks to start a provider link through the browser
- **THEN** it is refused with `profile_required` and no browser opens

### Requirement: The app contract only widens

Within `/api/app/v1/`, an endpoint SHALL NOT be removed or renamed, a request field SHALL NOT become required or narrower, and a response field SHALL NOT be removed or change meaning. A narrowing SHALL ship as a new version prefix beside the old one. The app's request and response shapes SHALL be its own, so reshaping a web form never changes them; rules on values, such as the password policy, still apply to both.

#### Scenario: A new optional field

- **WHEN** a release adds an optional request field to an endpoint
- **THEN** an app built before the release keeps working unchanged

#### Scenario: The web form is reshaped

- **WHEN** a release makes a field required on the web sign-up form
- **THEN** the app's sign-up endpoint still accepts the request shape it accepted before

### Requirement: Three answers may narrow the contract

Outside the widen-only rule, any app endpoint MAY answer `refused_for_security` (403, fixed message per cause), `app_update_required` (400, with the minimum version) or `api_version_retired` (410). From its first release every app build SHALL handle all three and send `X-App-Version: MAJOR.MINOR.PATCH`; under a configured minimum a missing or unparseable version counts as below it. The version is never a security control. Error answers SHALL carry `cache-control: no-store`.

#### Scenario: A return channel is closed

- **WHEN** grnyte stops accepting a return channel for security reasons
- **THEN** a start naming it answers `refused_for_security`, and an app built before that shows the refusal instead of failing silently

#### Scenario: App too old

- **WHEN** an app below the server's minimum version calls any endpoint
- **THEN** it receives `app_update_required` with the minimum version

#### Scenario: Header missing under a minimum

- **WHEN** a minimum version is configured and a call carries no `X-App-Version`
- **THEN** it receives `app_update_required`

#### Scenario: No minimum configured

- **WHEN** no minimum version is configured
- **THEN** no call is refused for its version

### Requirement: App-started flows are capped per client

An app-started flow (browser sign-in, link or Apple re-authentication, with or without a Bearer) SHALL be refused when the same client already holds 10 started flows that have neither returned nor expired, so starts cannot fill grnyte's storage. A client SHALL be an IPv4 address (mapped ones included) or an IPv6 /64, stored only as a one-way hash. The cap SHALL hold across server instances; a slight overshoot under simultaneous starts and the shared-address lockout are accepted.

#### Scenario: Eleventh open start

- **WHEN** one client starts an 11th flow while 10 of its starts are still open
- **THEN** the start is refused and nothing is stored

#### Scenario: Rotating IPv6 addresses

- **WHEN** a host starts flows from different IPv6 addresses inside one /64
- **THEN** they all count against one cap

#### Scenario: A signed-in caller's starts

- **WHEN** a client sending a valid Bearer already holds 10 open flows and starts another, for sign-in, link or Apple re-authentication
- **THEN** it is refused like any other start

#### Scenario: IPv4-mapped addresses

- **WHEN** two clients start flows from different IPv4 addresses that reach grnyte in the IPv4-mapped IPv6 form
- **THEN** each counts against its own cap, not one shared /64
