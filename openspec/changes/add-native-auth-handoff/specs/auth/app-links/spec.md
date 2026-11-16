# Spec Delta

## Purpose

Lets a link to grnyte content open in the native app once it is installed, while every sign-in and API path, and the end of every web sign-in, always stays in the browser.

## ADDED Requirements

### Requirement: grnyte publishes app-link files

grnyte SHALL serve `/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json` as JSON over HTTPS, with no redirect and without sign-in, naming the app `rocks.grnyte` with its team ID and signing certificate fingerprints from configuration. Each file SHALL answer 404 until its own app-specific setting is turned on: the Apple file by a dedicated switch, not by the team ID web sign-in already needs, and the Android file by its certificate fingerprints.

#### Scenario: Apple's fetcher

- **WHEN** the Apple file is switched on and an anonymous request fetches `/.well-known/apple-app-site-association`
- **THEN** it receives 200 with a JSON body, not a redirect to sign-in

#### Scenario: Web sign-in configured, no native app yet

- **WHEN** the team ID is set for web sign-in but the Apple file's switch is off
- **THEN** the Apple file answers 404

#### Scenario: Android not configured

- **WHEN** no Android certificate fingerprint is configured
- **THEN** the Android file answers 404

### Requirement: App links never claim sign-in or API paths

The Apple file SHALL exclude `/auth/*` and `/api/*` before any rule that includes paths, then include only grnyte's content paths (areas, blocks, routes, the feed, public profiles), the same list Android's link filters use. Neither SHALL claim the web home (`/explore`), the own-profile tab, invitations, `/settings`, `/regions`, another account screen or the whole site, so a web flow never jumps into the app mid-flow.

#### Scenario: Plain web sign-in with the app installed

- **WHEN** a person with the app installed signs in on the web with no destination, landing on the web home (`/explore`)
- **THEN** the sign-in ends in the browser

#### Scenario: Sign-in callback on a phone with the app

- **WHEN** a person with the app installed signs in on the web and the provider returns to `/auth/callback`
- **THEN** the return stays in the browser

#### Scenario: Content link

- **WHEN** a person with the app installed taps a link to `/routes/123`
- **THEN** the app may open it

#### Scenario: Path outside the content list

- **WHEN** a person with the app installed taps a link to `/legal/privacy`
- **THEN** it opens in the browser

#### Scenario: Web link flow with the app installed

- **WHEN** a person with the app installed links Google from settings on the web
- **THEN** the return lands on the web's sign-in methods screen in the browser, not in the app

### Requirement: Web sign-ins reach their destination in the page

Every web sign-in or sign-up flow that ends on a `next` destination (password, code, profile step, Google or Apple return, invitation sign-in) SHALL end on `/auth/continue?next=<path>` under the unclaimed `/auth`, never on a server redirect straight there. The page SHALL accept only a same-origin path outside `/auth`, else use the web home, and SHALL move there in-page, replacing its own history entry.

#### Scenario: Google sign-in started on a content page

- **WHEN** a person with the app installed starts "Continue with Google" on the web from `/routes/123` and finishes at Google
- **THEN** the provider return ends on `/auth/continue?next=/routes/123`, which moves to `/routes/123` in the browser, signed in, and the app does not open

#### Scenario: Password sign-in with a destination

- **WHEN** a person signs in with a password on `/auth/signin?next=/areas/5`
- **THEN** the browser reaches `/areas/5` through `/auth/continue`

#### Scenario: Foreign destination

- **WHEN** `/auth/continue` is opened with `next=//evil.example` or a path under `/auth`
- **THEN** it moves to the web home instead

#### Scenario: Back after arriving

- **WHEN** a person arrives on the destination through `/auth/continue` and presses Back
- **THEN** they do not land on `/auth/continue` again

#### Scenario: No JavaScript

- **WHEN** `/auth/continue?next=/routes/123` is rendered without JavaScript
- **THEN** it shows a link to `/routes/123`

#### Scenario: Signed-in reader on the page

- **WHEN** a signed-in person opens `/auth/continue?next=/routes/123`
- **THEN** the page is not bounced off `/auth` and moves to `/routes/123`

### Requirement: Web credentials serve only the iOS sign-in return

The Apple file SHALL contain the `applinks` section and a `webcredentials` section naming only the app, which exists so iOS hands the https sign-in return to the app; it SHALL contain no other section. grnyte SHALL build no passkey or shared-credential feature on it; iOS may offer saved grnyte passwords in the app as a side effect. The `applinks` section SHALL NOT claim the iOS return address.

#### Scenario: Reading the file

- **WHEN** the Apple file is read
- **THEN** its top-level keys are `applinks` and `webcredentials`, and `webcredentials` lists only the app
