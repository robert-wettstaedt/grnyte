## Why

`add-native-auth-handoff` built and merged the server side of signing in from a native app: the
`/api/app/v1/` endpoints, the browser handoff, native Apple on iOS and the link files. Nothing has
called them from a real app on a device yet. Its plan proved them with a throwaway Expo test app;
the first native app is where that proof belongs, since it has to do the same work anyway. This
change holds that app and the checks moved here from `add-native-auth-handoff` on 2026-11-17.

## What Changes

- The first native grnyte app, built with Expo beside the SvelteKit app. Scope, design and specs
  are written with `/opsx:propose` when the native work starts; this proposal is a placeholder for
  them.
- The device checks of `add-native-auth-handoff` (its tasks 12.1 to 12.14), run in this app
  instead of a separate `expo-auth-test/`.
- Its outside setup still open (its tasks 1.3 and 1.4): the three app secrets in Bitwarden and the
  app's bundle ID in GoTrue's Apple client-ID list.
- Carried over from its workflow follow-up:
  - routing for the content links it claims, keeping `APP_LINK_PREFIXES` and the app's intent
    filters in step;
  - a Chrome Auth Tab Expo module for Android (androidx.browser 1.9 or later, Chrome 137 or later,
    `AuthTabIntent.launch(launcher, url, host, path)` on an https return verified through Digital
    Asset Links, an `isAuthTabSupported` runtime check, and `rocks.grnyte:/auth` as the fallback for
    Firefox and other browsers);
  - app attestation (Apple App Attest, Google Play Integrity, for example through Firebase App
    Check), so the server offers a return channel only to a verified copy of the app, which ends
    the accepted impersonation risk;
  - a browser "Confirm with Apple" on Android through the handoff (a `confirm` purpose on
    `oauth/start`).

## Capabilities

To be written with the design. The checks moved here verify `auth/native-sign-in`,
`auth/native-handoff`, `auth/app-api` and `auth/app-links` as `add-native-auth-handoff` specified
them, including the requirements marked "client contract, not server-verifiable".

## Impact

- A new Expo project beside the SvelteKit app; where it lives is part of the design.
- Bitwarden (both environments) and GoTrue configuration (second stack, prod, shared stack).
- No server change is planned by the moved checks; a failing one reopens the server contract
  through a new change, since `/api/app/v1/*` shapes only widen (AGENTS.md).
