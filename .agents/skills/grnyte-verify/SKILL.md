---
name: grnyte-verify
description: Run and verify a change in the real dev app end-to-end — dev server, test login, chrome-devtools driving, and psql assertions. Use when asked to test/verify/screenshot a change in the app, confirm a flow works end-to-end, drive the UI, or check permission-gated behavior. Knows this project's ports, test data, and gotchas that the generic run/verify skills don't. Login credentials and the DB connection string live in memory (never in this file), not in git.
---

# Verify in the real app

Drive the actual running app, don't just trust types/tests. This project has a specific local setup.

## Credentials — from memory, not here

Test logins and the Postgres connection string are intentionally **not** in this git-tracked file.
Recall them from memory (`dev-test-login`). There are four seed users, one per permission tier
(no-perms / read-only / write / full-incl-delete), all sharing one password — **pick the user by the
permission you're exercising**: delete-gated UI needs the admin-tier user; a plain read view can use
the read-only user; write/edit flows use the maintainer-tier user.

## Preconditions

Confirm the stack is up before driving:
```
lsof -nP -iTCP -sTCP:LISTEN | grep -E '3000|4848|5433|6543'
```
- App (Vite `npm run dev`) on **:3000** — note: not Vite's 5173 default; falls back to :3001 if taken.
  It also hosts the Zero get-queries endpoint.
- zero-cache on :4848; supabase Postgres on :5433 (upstream) / :6543 (pooler).

If the app isn't up, start it with `npm run dev` (the backend/zero-cache are usually already running).

## Drive it (chrome-devtools MCP)

1. `navigate_page` to `http://localhost:3000/<route>`; the session is usually already logged in — if
   not, sign in at `/auth/signin` with the tier-appropriate user from memory.
2. `take_snapshot` (a11y tree, cheap, preferred) to read state and get element `uid`s; `click`/`fill`
   by uid. `take_screenshot` when layout matters — **`filePath` must be inside the workspace root**
   (the `/tmp` scratchpad path is rejected); write to a repo temp dir and delete it after.
3. `evaluate_script` for facts the a11y tree hides — e.g. `document.querySelector('video').currentSrc`,
   a computed style, `navigator.canShare`, an element's live `transform`.
4. `list_console_messages` filtered to `error`/`warn` to catch runtime errors.

### Gestures & cross-browser

The media viewer and topo are touch/gesture-heavy, so verifying them needs more than `click`:
- **Swipe/drag**: dispatch a synthetic sequence via `evaluate_script` — `new Touch({identifier, target,
  clientX, clientY})`, then `touchstart` → several `touchmove`s → `touchend`. Read the live
  `style.transform` *between* moves to prove the element follows the finger, not just the end state.
- **Hover/pointer-gated UI** (`(hover: hover)`, `(pointer: coarse)`): flip it with `emulate`
  `viewport: '390x844x3,mobile,touch'`; reset to a plain desktop viewport when done.
- **A Firefox/Safari-only code path**: firefox-devtools MCP needs marionette (usually not running — don't
  restart the user's browser). Force the branch from Chrome instead via `navigate_page`'s `initScript`,
  overriding the branching API (e.g. patch `HTMLMediaElement.prototype.canPlayType` to force the hls.js path).
- **Don't network-throttle to isolate render/load timing** — Slow 3G stalls Zero's sync so the app never
  boots. Verify load-order logic structurally (DOM/state) instead.

## Secure context (real phone, geolocation, push, PWA)

`http://<lan-ip>:3000` is not a secure context, so geolocation, push, the service worker and PWA
install are all unavailable and the failure looks like a bug in the feature. Reach the app through
Tailscale Serve instead, which fronts a local port with a real cert on the tailnet. The host name
and the current port mounts live in memory (`phone-testing-over-tailscale`), not in this file.

Two origins, and which one you want is not a detail:

- **Dev** (proxy :443 -> `http://127.0.0.1:3000`). Plain http target, no cert. `vite dev` skips
  Kit's origin check entirely, so nothing else is needed. Use this for almost everything.
- **Preview** (proxy :9173 -> `https+insecure://127.0.0.1:4173`, started as
  `PREVIEW_HTTPS=1 npm run preview`). Use it only when you need the real production bundle: the
  built service worker, PWA install, or anything that behaves differently unbundled.

Traps, all of them verified the hard way:

- **The preview build must serve TLS itself.** Kit reads the preview origin's protocol off
  `preview.https` alone and ignores `X-Forwarded-Proto`, so behind a TLS proxy without
  `PREVIEW_HTTPS=1` pages load fine while every remote function 403s with "Cross-site remote
  requests are forbidden". `csrf.checkOrigin` and `csrf.trustedOrigins` do NOT reach that check.
  A non-443 mount is fine: Kit takes the Host header verbatim, port included, and Serve preserves it.
- **A TLS preview stops answering plain http**, so `ZERO_GET_QUERIES_URL` breaks and Zero reports
  itself offline with `TransformFailed` / "Fetch from API server threw error". Point it at
  `http://localhost:3000/...` (dev serves the same endpoint, and zero-cache calls it server-to-server
  so it need not match the client you are driving).
- **HMR does not survive the hop.** Zero's WebSocket does, so the tunnel is fine; the Vite HMR socket
  will not open and there is no `[vite] connected.`. Reload by hand, and do not read a stale page as
  a failed change.
- **Service workers are per origin**, so dev registers `dev-sw.js` and preview `sw.js` independently.
  Good news: dev's worker cannot poison a preview PWA install. It also means clearing one clears
  nothing on the other.
- **Cookies are not per port**, so a session from one origin signs you in on the other, and
  `/auth/signin` will 303 you away when you expected the form.
- **iOS push needs the PWA installed** to the home screen. Permission cannot be granted from a Safari
  tab, no matter how correct the origin is.

Confirm the context before blaming the feature:

```js
() => ({ secure: isSecureContext, geo: typeof navigator.geolocation, push: 'PushManager' in window })
```

## Catalogue sweep (Storybook)

Driving the app proves one path works. When a change affects **every state of one thing** — the
wording of every event kind, every change-line shape, every entity row variant — drive the catalogue
instead: one story per case, all on screen at once. That is what caught nearly every copy and
fallback bug in the feed work; clicking through the app would have needed dozens of setups.

- `npm run storybook` (:6006, opens no browser). Stories are `*.stories.svelte`, co-located.
- The pattern to copy: `src/lib/entities/event/catalogue.ts` enumerates the cases,
  `catalogue.fixture.ts` builds a row per case, `EventCatalogue.stories.svelte` renders them. A new
  case is one entry in the catalogue, not a new story.
- Sweep it in the browser with the chrome-devtools MCP against the story iframe
  (`/iframe.html?id=<story-id>`), reading rendered text rather than trusting the fixture.
- What to look for: empty or `undefined` names, a case that renders no card at all, two cases that
  render identically, an untranslated key leaking through, copy that says the wrong actor.
- **Prove a refactor changed nothing**: fingerprint every story before and after (walk them in a
  hidden same-origin iframe, collecting `innerText` + `svg path` `d` + `img`/`href`) and diff. The
  how-to lives in memory (`storybook-fingerprint-equivalence`).
- Stories are part of the change: no duplicate story for a case the catalogue already covers, and a
  story that references a deleted fixture or a retired entity gets deleted with it.

## DB assertions

For persistence/RLS checks, query Postgres directly (connection string in memory / `.env`). Verify the
row actually changed, then revert test mutations so you leave the seed data as you found it.

## Before/after

- Run `svelte-autofixer` (Svelte MCP) on every new/edited `.svelte` until clean.
- `npm run check` (types) and lint your changed files.
- Useful seed data lives in memory (e.g. an area with geolocated blocks for map flows, a route with
  mixed image + video media for the media grid/viewer).
- Delete any screenshots/temp files you created inside the repo so they don't pollute git status.
