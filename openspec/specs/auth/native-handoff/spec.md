# auth/native-handoff Specification

## Purpose
Lets a native app sign in or link a provider through the system browser and get the result back safely, so that only the app that started the flow can redeem it and the browser keeps no grnyte session.

## Requirements

### Requirement: The app registers its PKCE challenge when it starts

An app-started browser flow SHALL begin with the app sending grnyte's app API a PKCE code challenge with method `S256`, the provider and its return channel (`ios` or `android`). grnyte SHALL refuse any other method, a missing challenge or a return channel outside its allowlist, store the challenge with a server-held transaction for 10 minutes, set no cookie, and answer with the provider URL to open. PKCE SHALL be required on both platforms.

#### Scenario: Plain challenge method

- **WHEN** the app starts a flow with challenge method `plain`
- **THEN** the start is refused and no transaction is stored

#### Scenario: Unknown return channel

- **WHEN** the app starts a flow naming a return channel grnyte does not know
- **THEN** the start is refused and no transaction is stored

#### Scenario: Valid start

- **WHEN** the app starts a Google sign-in with an S256 challenge
- **THEN** it receives a Google URL to open in the system browser

### Requirement: The provider returns to the web's return address

An app-started flow SHALL use the same provider return address as a web sign-in, one per provider, and grnyte SHALL register no other return address with Apple or Google. The return SHALL be matched to the app's server-held transaction by a hash of its state value alone, without any cookie, and the transaction SHALL be usable once.

#### Scenario: One return address

- **WHEN** the app starts a Google sign-in
- **THEN** the URL it opens names grnyte's web Google return address as the redirect

### Requirement: A late or replayed return goes back to the app

A provider return with an expired or already used state of an app-started flow SHALL send the browser to the flow's return with `error=expired`, issuing nothing and never asking the provider again; a used one SHALL be recorded, also after its code was exchanged, for at least an hour after the flow expired. A state grnyte never held for an app SHALL be treated as a web return.

#### Scenario: Replayed return

- **WHEN** a provider return of an app-started flow is replayed after it was already processed
- **THEN** nothing is issued, the browser is sent to the flow's return with `error=expired`, and a failed handoff is recorded

#### Scenario: Replayed after a successful exchange

- **WHEN** the app already exchanged its code and the same provider return is replayed
- **THEN** the replay is recognised and recorded the same way, and the provider's code is not redeemed again

#### Scenario: Late return

- **WHEN** the provider returns an app-started flow 11 minutes after it started
- **THEN** the browser is sent to the flow's return with `error=expired` and nothing is issued

### Requirement: The same provider checks apply as on the web

An app-started flow SHALL pass the very checks the web sign-in applies to the provider's answer, run by the same code: the expected provider, issuer and nonce before a code is issued, and the auto-link rule and linking conflicts before a session is issued.

#### Scenario: Wrong issuer

- **WHEN** a provider return carries an identity token from an unexpected issuer
- **THEN** no code is issued and the app receives `error=failed`

#### Scenario: Confirmed account without that provider

- **WHEN** an app-started Google sign-in returns an address that belongs to a confirmed account with no Google identity, at a domain Google does not own
- **THEN** the exchange issues no session, and the app is told to sign in and link from settings

### Requirement: The browser returns to the app with a one-time code

A successful return SHALL redirect the browser to the flow's return with a one-time code of at least 128 bits of randomness: on iOS grnyte's https return address `/app-return`, on Android `rocks.grnyte:/auth`. grnyte SHALL store only a hash of the code, and the code SHALL expire 60 seconds after it is issued. The provider's verified answer held until the exchange SHALL be stored only encrypted, in a table no client can query.

#### Scenario: Successful provider return on iOS

- **WHEN** the person approves a sign-in started by the iOS app
- **THEN** the browser is sent to `https://<grnyte>/app-return?code=` and the app's auth session closes

#### Scenario: Successful provider return on Android

- **WHEN** the person approves a sign-in started by the Android app
- **THEN** the browser is sent to `rocks.grnyte:/auth?code=` and the app's auth session closes

#### Scenario: Code redeemed after 61 seconds

- **WHEN** the app redeems a code 61 seconds after it was issued
- **THEN** the exchange is refused and no session is issued

### Requirement: The iOS return reaches only grnyte's app

On iOS the return address SHALL be an https address on grnyte's domain that iOS hands only to the app grnyte's association file names, so no other app can catch the code of a flow grnyte's iOS app started. Opened as a web page, it SHALL say to go back to the grnyte app, offer one plain link to grnyte without the query that does not claim to open the app, carry the code in no markup or script, and not be cached or sent as a referrer.

#### Scenario: Return opened in a browser

- **WHEN** an iOS return address with a code is opened in a plain browser
- **THEN** the page says to go back to the grnyte app, links only to grnyte without the query, carries the code in no markup or script, and is not cached

### Requirement: A code is redeemed once, with the matching verifier

The exchange SHALL spend the code in the same step that reads it, so two concurrent exchanges cannot both succeed. It SHALL issue a session only when the SHA-256 of the presented verifier, base64url encoded, equals the challenge registered at the start. A wrong verifier SHALL spend the code. This binds a code to the app that started its flow; it does not prove which app started it (design.md, Risks: client impersonation).

#### Scenario: Second exchange

- **WHEN** the app redeems a code, then the same code is presented again
- **THEN** the second exchange is refused

#### Scenario: Code caught by an app that did not start the flow

- **WHEN** another Android app that claimed `rocks.grnyte:` catches the redirect of a flow grnyte's app started and presents the code with its own verifier
- **THEN** no session is issued, the code is spent, and a failed handoff is recorded

#### Scenario: Matching verifier

- **WHEN** the app presents the code within 60 seconds with the verifier whose challenge it registered
- **THEN** it receives a session for the provider's account

### Requirement: App-started flows set no web cookies

No response in an app-started flow, from the start through the provider return to the exchange, SHALL set a cookie, and the browser SHALL hold no grnyte session afterwards. The shared return address SHALL NOT read or refresh a web session before it knows the flow is a web one.

#### Scenario: Sign-in finished in the in-app browser

- **WHEN** a person finishes a Google sign-in started from the app and then opens grnyte in the same browser
- **THEN** they are signed out there

#### Scenario: Browser already signed in on the web

- **WHEN** the in-app browser already holds a web session for grnyte and the flow returns
- **THEN** the return neither reads nor changes that session

### Requirement: Linking through the browser stays with the account that started it

An app-started link SHALL require a Bearer caller with a fresh confirmation for linking that provider when it starts, and its exchange SHALL succeed only for a Bearer caller with the same account and session. The link SHALL then follow the web's linking rules.

#### Scenario: Exchange from another account

- **WHEN** a link flow started by account A is exchanged with a Bearer token of account B
- **THEN** nothing is linked and the code is spent

#### Scenario: Link without re-authentication

- **WHEN** the app starts a link without a fresh confirmation for linking that provider
- **THEN** the start is refused and no browser opens

### Requirement: A failed return tells the app why

When the provider reports a cancellation, or the return fails a check, the browser SHALL be sent to the flow's return with an error reason of `cancelled`, `expired` or `failed` and no code.

#### Scenario: Person cancels at the provider

- **WHEN** the person cancels at Google's consent screen
- **THEN** the app receives `error=cancelled` and shows no error message

### Requirement: Handoff failures are recorded

grnyte SHALL record a failed handoff, with its reason and no code, verifier or token, for a replayed provider return, an unknown, expired or spent code, a wrong verifier, a link exchanged by another caller, and a native Apple token, Apple re-authentication or Apple authorization code that fails its check; these SHALL count toward the existing spike alert. A refusal the shared provider checks or account rules already record, and a cancellation, SHALL NOT be recorded as a failed handoff.

#### Scenario: Burst of failed handoffs

- **WHEN** more than 20 handoffs fail within an hour
- **THEN** admins receive one alert for failed handoffs that day

#### Scenario: Refused by the shared checks

- **WHEN** an app-started return fails the shared issuer check
- **THEN** only that check's own event is recorded, not a failed handoff
