---
name: grnyte-verify
description: Run and verify a change in the real dev app end-to-end, covering the dev server, test logins, Chrome and Firefox driving, the iOS Simulator, Storybook sweeps and psql assertions. Use when asked to test/verify/screenshot a change in the app, confirm a flow works end-to-end, drive the UI, check a German or dark-mode layout, or check permission-gated behavior. Knows this project's ports, test data, and gotchas that the generic run/verify skills don't. Login credentials live in memory, not in git.
---

# Verify in the real app

Drive the actual running app, don't just trust types/tests. This project has a specific local setup.

## Credentials: from memory, not here

Test logins are intentionally **not** in this git-tracked file. Recall them from memory
(`dev-test-login`). Pick the user on two axes, not one:

- **Permission tier.** Four seed users (no-perms / read-only / write / full-incl-delete) share one
  password. Delete-gated UI needs the admin-tier user; a plain read view can use the read-only one.
- **Region-membership shape.** A fifth user belongs to a single region, which is the only way to
  reach the several code paths that branch on how many regions a person is in.

## Preconditions

Confirm the stack is up before driving:
```
lsof -nP -iTCP -sTCP:LISTEN | grep -E '3000|4848|5433|6543'
```
- App (Vite `npm run dev`) on **:3000**. Note: not Vite's 5173 default; falls back to :3001 if taken.
  It also hosts the Zero get-queries endpoint.
- zero-cache on :4848; supabase Postgres on :5433 (upstream) / :6543 (pooler).

If the app isn't up, start it with `npm run dev` (the backend/zero-cache are usually already running).

## Drive it (chrome-devtools MCP)

1. `navigate_page` to `http://localhost:3000/<route>`; the session is usually already logged in; if
   not, sign in at `/auth/signin` with the tier-appropriate user from memory.
2. `take_snapshot` (a11y tree, cheap, preferred) to read state and get element `uid`s; `click`/`fill`
   by uid. `take_screenshot` when layout matters. **`filePath` must be inside the workspace root**
   (the `/tmp` scratchpad path is rejected); write to a repo temp dir and delete it after.
3. `evaluate_script` for facts the a11y tree hides, such as `document.querySelector('video').currentSrc`,
   a computed style, `navigator.canShare`, an element's live `transform`.
4. `list_console_messages` filtered to `error`/`warn` to catch runtime errors.

### Locale, theme and viewport

Three axes, not one: `en`/`de`, dark/light, 375x667 and 1280x800. German is the longer locale and is
where this project's overflow bugs live (topo editor top row and add button, tab strip, ascent labels
like "Wiederholung", long profile titles). Screenshot any layout, button row, tab strip or form label
in `de` at 375 too, not just `en` at desktop width.

One paste in the console flips both and reloads into them:

```js
document.cookie = 'PARAGLIDE_LOCALE=de; path=/; max-age=34560000' // or en
localStorage.setItem('mode', 'light') // or dark, system
location.reload()
```

The cookie wins because paraglide's strategy is `['globalVariable', 'cookie', ...]` and the global is
unset on a fresh load. For SSR copy only, skip the browser:
`curl -sH 'Cookie: PARAGLIDE_LOCALE=de' http://localhost:3000/<route>`.

### Gestures & cross-browser

The media viewer and topo are touch/gesture-heavy, so verifying them needs more than `click`:
- **Swipe/drag**: dispatch a synthetic sequence via `evaluate_script`: `new Touch({identifier, target,
  clientX, clientY})`, then `touchstart` → several `touchmove`s → `touchend`. Read the live
  `style.transform` *between* moves to prove the element follows the finger, not just the end state.
- **Hover/pointer-gated UI** (`(hover: hover)`, `(pointer: coarse)`): flip it with `emulate`
  `viewport: '390x844x3,mobile,touch'`; reset to a plain desktop viewport when done.
- **Firefox is a first-class second browser here, not a fallback.** firefox-devtools MCP drives it
  directly (`take_snapshot`, `click_by_uid`, `fill_by_uid`), and animation and layout bugs have
  survived a Chrome-only pass. Check anything visual in both. For a Safari-only code path, force the
  branch from Chrome via `navigate_page`'s `initScript`, overriding the branching API (e.g. patch
  `HTMLMediaElement.prototype.canPlayType` to force the hls.js path).
- **Release the browser when you stop driving.** One profile serves every session, so close the pages
  you opened; a locked or wedged browser is usually a leaked session, yours or a peer's.
- **Don't network-throttle to isolate render/load timing.** Slow 3G stalls Zero's sync so the app never
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

## Real WebKit: the iOS Simulator

Use it when chrome-devtools MCP cannot attach, or for WebKit-specific behaviour (PWA install, iOS
push, safe-area insets, real scroll bounce). It is Mobile Safari, not an emulation.

**Drive it with `idb`, not `simctl`.** `simctl` can boot, open a URL and screenshot, but it cannot
tap or type; idb does the whole interaction half and is much the easier tool. Start one long-lived
companion per simulator. `--only simulator` is mandatory: without it idb hangs enumerating physical
devices on Xcode 26 (memory: `idb-simulator-only`).

```sh
nohup idb_companion --udid <UDID> --only simulator > "$TMPDIR/comp.json" 2> "$TMPDIR/comp.log" &
cat "$TMPDIR/comp.json"                      # {"grpc_port":N}, so far always 10882
C=localhost:<N>
idb --companion $C describe                  # confirms it is attached
idb --companion $C ui tap <x> <y>
idb --companion $C ui text "The Roof"        # types into the focused field
idb --companion $C ui swipe <x1> <y1> <x2> <y2> --duration 0.4
idb --companion $C ui key 40                 # HID usage: 40 Return, 41 Escape
idb --companion $C ui button HOME            # also APPLE_PAY, LOCK, SIDE_BUTTON, SIRI
idb --companion $C ui pinch / multi-tap      # see `idb ui --help`
```

**Coordinates are POINTS, screenshots are PIXELS.** iPhone 17 Pro sim is 402x874 pt against
1206x2622 px, so divide a measured screenshot coordinate by 3 before tapping it.

`idb ui swipe` is a constant-velocity line that lifts at the end, so chained swipes read as N
separate flicks, not one drag. For a held multi-point drag, drive idb's gRPC client directly: a
touch move is just another DOWN at a new point, so `DOWN(p0)..DOWN(pn), UP` is one continuous
gesture. `capture/rig.py` is a worked example while it exists.

`simctl` keeps the lifecycle and capture half:

```sh
xcrun simctl list devices booted
xcrun simctl openurl booted "<https preview url>"   # the Tailscale origin above, not <lan-ip>:3000
xcrun simctl io booted screenshot "$TMPDIR/s1.png"
xcrun simctl ui booted appearance dark              # theme follows the sim; locale is an in-app cookie
```

Every `xcrun` call in this sandbox prints `couldn't create cache file ... xcrun_db-...` on stderr,
and `simctl io` adds `Detected file type` / `No display specified`. All noise, not failures. Filter
with `2>&1 | grep -v "xcrun_db\|Detected\|No display"` before reading a result.

Reach the app over the preview origin or the secure-context features you came to test are all
unavailable. A home-screen web app has its own storage, so a Safari sign-in does not carry over, and
`simctl` cannot launch or terminate one: screenshot first to see where you are.

## Catalogue sweep (Storybook)

Driving the app proves one path works. When a change affects **every state of one thing**: the
wording of every event kind, every change-line shape, every entity row variant. Drive the catalogue
instead: one story per case, all on screen at once. That is what caught nearly every copy and
fallback bug in the feed work; clicking through the app would have needed dozens of setups.

- `npm run storybook` (:6006, opens no browser). Stories are `*.stories.svelte`, co-located.
  If :6006 is taken, `storybook dev` prompts for another port, which hangs a non-interactive start,
  so pass your own (`npx storybook dev -p 6007 --no-open --quiet`). Wait on it, then list ids, never
  guess them: they are generated from title plus story name.

      P=6006; until curl -sf -o /dev/null http://localhost:$P/index.json; do sleep 1; done
      curl -s http://localhost:$P/index.json | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);Object.values(j.entries).filter(e=>e.type==='story').forEach(e=>console.log(e.id,'|',e.title,'|',e.name))})"

  Filter `type === 'story'`: every component also has a `--docs` entry that renders nothing here.
  `entries[].id` is what goes in `/iframe.html?id=<id>`.
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

Query the dev Postgres through the container, never the host port: :5433 and :6543 intermittently
wedge and the symptom is a trivial statement hanging forever against an idle DB. No password and no
`.env` value are needed.

```
docker exec -i supabase-db psql -U postgres -d postgres -c "select ..."
docker exec -i supabase-db psql -U postgres -d postgres <<'SQL'
```

`-i` is what lets it read stdin or a heredoc. Verify the row actually changed, then revert test
mutations so you leave the seed data as you found it.

## Before/after

- Run `svelte-autofixer` (Svelte MCP) on every new/edited `.svelte` until clean.
- `./node_modules/.bin/svelte-check --tsconfig ./tsconfig.json` (types) and lint your changed files.
  Never `npm run check` here: its `svelte-kit sync` step 500s the dev server you are driving.
- Useful seed data lives in memory (e.g. an area with geolocated blocks for map flows, a route with
  mixed image + video media for the media grid/viewer).
- Delete any screenshots/temp files you created inside the repo so they don't pollute git status.
