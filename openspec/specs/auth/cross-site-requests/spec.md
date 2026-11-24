# auth/cross-site-requests Specification

## Purpose
Stops another site from making a signed-in person's browser change something on grnyte, using the browser's own statement of where a request came from.

## Requirements

### Requirement: Cookie-authenticated changes must come from grnyte's own pages

A request that carries grnyte's session cookie and uses any method other than GET or HEAD SHALL be refused before it reaches any handler, in development as in production, unless the browser marks it as coming from grnyte's own origin (`Sec-Fetch-Site: same-origin`). A request marked as coming from another site, a sibling site or no page at all SHALL be refused, except on the paths the next requirement exempts.

#### Scenario: Plain-text post to an endpoint

- **WHEN** a page on another site makes a signed-in person's browser post a `text/plain` body to one of grnyte's server endpoints
- **THEN** the request is refused and nothing changes

#### Scenario: grnyte's own form

- **WHEN** a signed-in person submits a form on grnyte
- **THEN** the request is served as usual

#### Scenario: Reading a page

- **WHEN** a person follows a link from another site to a grnyte page
- **THEN** the page loads as usual

### Requirement: Two paths are exempt, by where the request was sent

The only exceptions SHALL be the Apple sign-in callback, which Apple posts to from its own site by design and which reads no session, and the paths reserved for the native app's API, on which the server never reads the session cookie at all. The exceptions SHALL be decided by the path the request was actually sent to, never by the page it was sent from.

#### Scenario: Cookie on the app API

- **WHEN** a request to the app API's paths carries grnyte's session cookie and comes from another site
- **THEN** it passes this rule, and the server does not treat it as signed in by that cookie

#### Scenario: A remote call made from the callback page

- **WHEN** a cross-site request is sent to a grnyte remote function while naming the Apple callback as the page it came from
- **THEN** it is refused, because it was not sent to the callback

#### Scenario: Apple's return

- **WHEN** Apple posts a sign-in answer to grnyte's Apple callback from Apple's own site
- **THEN** it is not refused by this rule

### Requirement: Without the browser's statement the origin check decides

When a request carries no `Sec-Fetch-Site` header, the rule above SHALL NOT refuse it, and the framework's own origin check SHALL decide: in a production build a cross-origin form post SHALL still be refused. The framework makes no such check on the development server, so there a header-less request passes.

#### Scenario: Old browser, foreign form

- **WHEN** a browser that sends no `Sec-Fetch-Site` header posts a form from another origin to a production build of grnyte
- **THEN** the request is refused
