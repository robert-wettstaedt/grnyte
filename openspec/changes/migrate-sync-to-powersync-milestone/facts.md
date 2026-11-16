# Day-1 facts (2026-11-07)

Read by the user on prod and on the VPS; pasted verbatim, decisions below.

## Prod Postgres

- `max_replication_slots` = 5.
- `pg_replication_slots`: one slot, `zero_0_a`, active, `reserved`, 56 bytes retained. Four free, so zero-cache and PowerSync can hold one each through the overlap release.
- `bunny_streams` per region: 34: 226, 32: 125, 4: 117, 33: 94, 36: 25, 41: 4, 37: 1.

## VPS `zero-arm-01`

- Memory 3,805 MB total, 1,194 used, 2,611 available, no swap.
- 2 CPUs.
- Disk 38 GB, 24 GB free on `/`.

## Decisions these settle

- `bunny_streams` is auto-subscribed (largest region 226 rows, threshold was 2,000). Task 2.1.
- Memory caps for the overlap release (task 7.2): MongoDB WiredTiger cache 512 MB, PowerSync service `NODE_OPTIONS=--max-old-space-size=768`. With zero-cache's resident ~1.2 GB that leaves ~1 GB headroom and no swap; a reconnect storm during the overlap is the one case this box cannot absorb, and it ends when zero-cache is removed one release later.
- Replication: one new slot, well within the five. Drop `zero_0_a` the day zero-cache stops (R3).

## Sync-rules evaluator (task 1.3)

`@powersync/service-sync-rules` 0.44.0 (the version bundled in `journeyapps/powersync-service:1.27.2`; 0.45.0 is on npm but under the 7-day release-age policy). Installed as a dev dependency and probed against the trial config (a throwaway script, since deleted): it parses in node. API: `SqlSyncRules.validate(yaml, { defaultSchema })` returns the service's own warnings (on the trial config: five, the `*` after an aliased `id`, and the four client-parameter streams flagged as unsuitable for authorization, which is exactly the check 2.4 wants), `SqlSyncRules.fromYaml(yaml, options).config` is a `SyncConfig` whose `hydrate(params)` gives the `HydratedSyncConfig` with `getBucketParameterQuerier({ globalParameters, hasDefaultStreams, ... })` for the parameter half and `evaluateRow({ sourceTable, record, ... })` for the data half. The membership test (2.4) runs both against rows read from the test Postgres. `@powersync/node` is installed for the EXPLAIN guard (6.1).

## Prod and first-sync measurements (2026-11-09)

Prod, read by the user: `max_slot_wal_keep_size` 512MB; slots `zero_0_a` and `powersync_1_f5de`, both active and `reserved`. First replication: engine started 14:44:44 UTC, first checkpoint 14:45:00. The user's account synced headlessly from prod in 1,466 ms (37,513 rows, 2.6 MB, 8 regions), of which the map's tables are areas 1,339, blocks 2,703 and geolocations 2,442 (~6,500).

First sync of `admin@` on the dev stack (30,008 operations, 12.4 MB; `guidebook[18]` alone 27,844), time for the big stream from connect to synced:

| Client and setting                                     | Seconds                                |
| ------------------------------------------------------ | -------------------------------------- |
| Chrome, IndexedDB (and `SimpleOpfsVFS`)                | 3.3                                    |
| iOS 27.2 Simulator, IndexedDB, map page                | 23.7                                   |
| iOS 27.2 Simulator, IndexedDB, Profile page            | 23.1                                   |
| iOS 27.2 Simulator, IndexedDB, sync in a shared worker | 25.6                                   |
| iOS 27.2 Simulator, `SimpleOpfsVFS` (2.7.0)            | 19.6, then no reconnect after a reload |
| User's iPhone, prod, home-screen app (user's account)  | 45 to 60, pill to done; Zero 4         |

Web Inspector recording of an iOS first sync: the page's main thread at 65 to 80% for the whole sync, the database worker at ~5%, and only 0.35 s of JavaScript sampled. Service defaults: `DEFAULT_DOCUMENT_BATCH_LIMIT` 1,000 operations and `DEFAULT_DOCUMENT_CHUNK_LIMIT_BYTES` 1 MiB per line. `wa-sqlite-jspi.wasm` (742 KB) contains no `powersync_init`; `wa-sqlite-async.wasm` (2.3 MB) and the cipher build `mc-wa-sqlite-jspi.wasm` (1.3 MB, with `powersync_init_static`) do. Swapping the plain JSPI build into PowerSync's worker failed at open (`TypeError: s is not a function`). Sources for the cause: WebKit bug 329813, as reported for wa-sqlite at https://github.com/lalexdotcom/browser-sqlite/issues/11 (Safari 27.2), and powersync-js #808 for the OPFS reload hang. Cause and decisions: design D12.

## Task 8.6: JSPI with PowerSync (2026-11-09)

`admin@` on the dev stack, a first sync read from the sync timeline (big stream, connect to synced):

| Client and setting                                                                              | Seconds |
| ----------------------------------------------------------------------------------------------- | ------- |
| Chrome, Asyncify (before)                                                                       | 3.3     |
| Chrome, JSPI (`mc-wa-sqlite-jspi`; the new Chrome baseline)                                     | 1.8     |
| iOS 27.2 Simulator, Asyncify, Profile (before)                                                  | 23.1    |
| iOS 27.2 Simulator, JSPI, Profile                                                               | 20.6    |
| iOS 27.2 Simulator, JSPI, Sync health, collections lazy (`PUBLIC_POWERSYNC_SKIP_COLLECTIONS=1`) | 20.4    |

The build probe (`select sqlite3mc_version()`) answered "SQLite3 Multiple Ciphers 2.3.3" in both Chrome and the Simulator, so JSPI ran in both. A store the Asyncify build wrote opened on the JSPI build in the Simulator, synced. The production build's `sw.size.test.ts` went red without the new precache glob and green with it.

Reading: D12's hypothesis does not hold. JSPI saves ~11% in WebKit (and ~45% in Chrome), and the TanStack collections cost nothing measurable (the "taken in" steps follow within 0.1 to 0.3 s). The time is spent inside PowerSync's own engine in WebKit, whatever the SQLite build, storage or screen.

Side observation: the page-load counter did not count the reload that the "new version" banner triggered in the Simulator (23 entries before and after). To check before the 8.4 soak. Checked 2026-11-10 in Chrome: a real update (a rebuild with a changed bundle, the worker updated, the banner's Reload clicked) added an entry and loaded the new build, so it does not reproduce; an update during the soak counts as a page load.

iPhone, prod, the user's account, the Vercel preview with the JSPI swap (2026-11-09): the timeline names "JSPI (mc SQLite3 Multiple Ciphers 2.3.3)", so the iPhone's WebKit has JSPI. First block marker after the "Sign in" tap, from a screen recording: 30, 27 and 27 s (three runs). Guidebook stream: 23.4 s (connected 13.9 s, synced 37.8 s after the page loaded). Zero: 4 s. By 8.7's trigger, map first is due.

## Task 8.7: map first (2026-11-09)

Dev stack, `admin@`, the local service on this branch's config (the `map` stream active), a production build previewed on a fresh origin.

iOS 27.2 Simulator: the first block markers drew as count-unknown rings about 6 s after the page loaded (read off screenshots, not a recording), an area sheet opened meanwhile showed its skeletons, and the counts and the grade histogram filled in at about 26 to 30 s with no marker moving.

Chrome, fresh isolated profile per run, downloading to "synced: all": 2.6 s on the first run after the service restart, then 1.7 and 1.7 s, against 8.6's 1.8 s. `map` was confirmed and taken in 0.7 s after downloading began.

iPhone, prod, the user's account, the Vercel preview with map first and the `map` stream live on prod (2026-11-10), timed from the "Sign in" tap on a screen recording, website data deleted before each run:

| Run | First block marker (count unknown) | Counts filled in |
| --- | ---------------------------------- | ---------------- |
| 1   | 3 s                                | 27 s             |
| 2   | 3 s                                | 28 s             |
| 3   | 3 s                                | 28 s             |

Zero's build: first marker 4 s. Before map first (8.6, JSPI): 27 to 30 s. Timeline of the last run, from connecting: `map` synced 1.2 s and taken in 1.8 s after it, `guidebook` synced 24.6 s and taken in 25.1 s after it. The guidebook's first sync itself is unchanged; map first moves the map out from behind it.

## Cold start of a synced store (2026-11-10)

iPhone, prod, three runs each, to the first block marker: PowerSync 4.0 s median (3.5, 4.0, 4.2), Zero 2.5 s (2.5, 2.5, 3.0). Reopen: 0 s on both.

iOS 27.2 Simulator, dev stack, `admin@`, Safari quit and relaunched on a synced store, seconds since page load: store open 0.6, collections ready 1.4, map places ready 1.6, connected 1.8, every stream synced 20.6. Chrome after a reload: store open 0.25, collections ready 0.77, places ready 0.97, connected 0.83, all synced 1.1.

The server answered the Simulator's reconnect with 0 operations and about 5 KB, its checkpoint complete in 17 ms (service log), so the 19 s is spent in the client. With collections off (`PUBLIC_POWERSYNC_SKIP_COLLECTIONS=1`) the priority 0 to 2 streams confirm at 0.8 s and only `media` (priority 3, the full checkpoint) lands at 20.0 s: completing a full checkpoint with nothing in it takes ~19 s in WebKit and 0.3 s in Chrome. With collections on, every stream waits for it. The map reads from disk and draws before it, so it costs freshness and CPU, not the first marker. For the upstream issue (8.8).

Collections loaded on first use (`startSync: false`, 2026-11-10), same setups: map places ready 1.1 s after page load on a Simulator cold start (1.6 s eager, one run each), 0.55 s after a Chrome reload (0.97 s). Block, route, area, profile and search pages render in full, with no console errors.

iPhone, prod, collections on first use (00a77420), cold start of a synced store to the first block marker: 2.4, 2.2, 2.2 s, median 2.2 s against Zero's 2.5 s (4.0 s with eager collections). Timeline: store open 0.8 s, map places ready 1.6 s after page load; the reconnect's empty checkpoint still completes at 20.7 s.

## Task 8.3 in the Simulator (2026-11-10)

iOS 27.2 Simulator, `admin@`, both sides production builds on the dev stack: PowerSync is this branch (collections on first use) on `vite preview`, Zero is `develop` (7bf05b7a) built the same way against the local zero-cache. Each run is a Safari cold start straight onto the screen's URL, screen-recorded; times are from the first page paint to the screen's content, read off the frames where the screen changed (three runs each, median). Safari's own launch, ~4.2 s to the first paint, is the same on both and left out.

| Screen                          | Zero   | PowerSync             | What PowerSync shows meanwhile                 |
| ------------------------------- | ------ | --------------------- | ---------------------------------------------- |
| Block                           | 0.59 s | 1.00 s                | header, then the route list                    |
| Area                            | 0.57 s | 2.57 s (1.64 to 2.68) | header and a grades skeleton until routes load |
| Route                           | 0.46 s | 1.53 s                | header, then ascents                           |
| Another member's profile        | 0.48 s | 1.14 s                | name, stats as dashes                          |
| Map with a filter (`hasTopo=1`) | 0.51 s | 1.04 s                | map, then the filtered markers                 |

Search was not measured (its query is not in the URL). Reading: on a cold start the first screen that reads `routes` or `ascents` waits for the whole table to load from SQLite into its collection; with collections loaded at startup (before 00a77420) that cost sat on the map instead (rule 1). The Simulator and the iPhone agreed within 70 to 100 % wherever both were measured.

## What a cold-start screen waits on, and three collection modes (2026-11-10)

Timeline marks per SQL query and per collection load (Simulator, area cold start): every read goes through the one database worker in turn. Lazy collections: small collections 0.7 to 1.3 s after page load, then the map's place queries (each run twice), then the area's route queries until 2.1 s. The sub-area rows each ran the full route-list query (tags, first ascents, topos as JSON) for a grade donut; they now read the slim map rows (`AreaListItem.svelte`). With the service paused (no reconnect) the area still took ~1.6 s; the reconnect's 19 s checkpoint adds up to ~1 s on top while it runs. A Chrome trace under DevTools was no use for this: async stack capture for every promise dominated it.

Modes behind `PUBLIC_POWERSYNC_COLLECTIONS` (measurement switch, goes in R1), Simulator, first paint to content, median of three cold starts, after the sub-area fix:

| Screen | lazy   | on-demand | preload after the map | Zero   |
| ------ | ------ | --------- | --------------------- | ------ |
| Area   | 1.63 s | 1.25 s    | 1.67 s                | 0.57 s |
| Block  | 1.76 s | 1.31 s    | 1.80 s                | 0.59 s |
| Route  | 1.22 s | 0.63 s    | 1.24 s                | 0.46 s |

On-demand (`syncMode: 'on-demand'` in `@tanstack/powersync-db-collection` 0.2.12) loads only the rows a query asks for and renders every screen checked. Preload does not help a screen opened at start, its background loads compete with it. Raw SQL for the remaining collection reads was not built: the remaining gap sits in reads that are raw SQL already (the map's place and route queries, the route list).

On demand by default (b6613a2f), with the map's place queries run once (the create flow reads its own copies only while open, the empty-region check reads one row), same setup: area 1.15 s, block 1.14 s, route 0.63 s (Zero 0.57, 0.59, 0.46). Map cold start: places ready 0.9 s after page load (1.1 s lazy, 1.6 s eager). The reconnect's priority 0 and 1 streams now confirm within ~0.5 s of connecting; only the full checkpoint still takes ~19 s.

## Scripted screen measurement (2026-11-14)

`npm run measure:screens -- [runs] [Area,Block,...]` replaces the hand-read recordings: it serves both production builds behind a proxy on :4183 and :4186 (same origins, so stores and sign-ins carry over), opens each screen in the booted Simulator after terminating Safari, and prints the median from first contentful paint to the last DOM change before 2 s of quiet with no skeleton left (`aria-busy`), the status pill excluded. A run still showing a skeleton after 60 s is discarded and the skeleton named. Two differences from the recordings: relaunching Safari restored its tab from Safari's own cache with no request, so runs now open the URL instead; and the probe denies geolocation, since Safari's per-load location prompt suspended the page. First check, one run: block 1.21 s against Zero's 0.56 s, matching the recordings (1.14, 0.59). Zero's get-queries endpoint lives on the dev server (:3000), so a full run needs `npm run dev` up.

First full run, 3 each (Zero via `vite dev` on :3000): area 1.39 s against 0.53 s, block 1.21 s against 0.57 s, profile 0.72 s against 0.36 s (1 run). Void for PowerSync: `PUBLIC_POWERSYNC_URL` is read at runtime and only `vite dev` falls back to `localhost:58100`, so these previews never connected (the script now sets the fallback). Route: Zero 10.13 s, PowerSync never within 60 s. Both wait on the grade-votes row, which with no vote on route 203 stays a skeleton until the ascent list is answered: on PowerSync that needs `region_activity`, `guidebook`, `media` and `members` confirmed on the connection, and `media` confirms only with the full checkpoint, the WebKit stall of 8.8.

First valid run (2026-11-14, both previews built for the local stack, Safari data cleared after every page load hung with no response reaching the page (cause unknown; each origin served one build, and a signed-in request through the same proxy answered in 89 ms), PowerSync connected), median of 3: area 1.39 s against 0.54 s, block 1.36 s against 0.56 s, route 20.62 s against 2.80 s, profile 0.93 s against 0.39 s. The route waits on its grade-votes row, empty on route 203. Sync marks of a route cold start: every stream, `essentials` (priority 0) and `map` (priority 1) included, confirms at ~20.5 s, together with the full checkpoint; none earlier. This contradicts the 2026-11-10 note above (priority 0 and 1 confirming within ~0.5 s) and is not explained: the two runs differ in build, store history and harness, and nothing between was bisected. D13 rests on the measured screen times, not on this mechanism. So any PowerSync screen that must claim "none" (a zero count, an empty list) waits for the WebKit reconnect stall after every cold start, even with last session's rows on the device. Reading the votes from `region_activity` alone instead of the four media streams did not change that.

## Inputs from the trials (copied 2026-11-14 for design D13; source: the local `docs/sync-engine-evaluation.md`)

- Expo spike (trial 3, 2026-11-06): a throwaway Expo app on the user's real iPhone, PowerSync with native SQLite and TanStack DB. Cold sync 0.8 to 2.2 s. An ascent logged offline went into an intent queue and reached the server through Zero's mutate endpoint after reconnecting.
- Server cost and load: trial 1, 50 clients, PowerSync 4.8x faster with 8.5x less server memory; trial 3, PowerSync ~16 to 29x less server memory per device, Zero's full-scale reconnect storm aborted at 10.5 GiB. PowerSync on Postgres bucket storage was CPU-hungry (updates 4 to 5 s at 0.4 CPU); on MongoDB storage, which production uses, it was the cheapest setup (~50 ms updates) but needs ~1 CPU for reconnect storms.
- Live updates (trial 2): PowerSync 108 ms against Zero's 16 ms.

## Task 8.11: desktop measurement (2026-11-14)

`BROWSER=chrome npm run measure:screens -- 3`: Playwright's bundled Chromium 151 (Google Chrome is not installed on the measuring Mac), a kept profile per build, so each run is a cold start of a warm store; both production builds on the local stack, `admin@`; the PowerSync preview served PowerSync-only. 24 `/sync/stream` connections from Chromium during the run; route 203's name restored afterwards. Median of 3, first paint to settled (the map: to `map: places ready`):

| Screen  | PowerSync | Zero   | D13 bar (under 1 s) |
| ------- | --------- | ------ | ------------------- |
| Area    | 0.90 s    | 0.06 s | pass                |
| Block   | 0.79 s    | 0.03 s | pass                |
| Route   | 0.41 s    | 0.05 s | pass                |
| Profile | 1.27 s    | 0.06 s | fail                |
| Map     | 0.31 s    | n/a    | pass                |

Live update (a `psql` rename of route 203 shown on the open route page): PowerSync 0.07 s, within the 5 s bar. Zero's never showed within 30 s in any of the three runs, cause not investigated (Zero's numbers are context only). Route 203 settled at 0.41 s in Chromium, so its empty votes row did not wait for a reconnect stall there, unlike WebKit's 20.6 s. Zero's 0.03 to 0.06 s means its warm store already has the content at first paint.

Corrected the same day (probe version 4, `ONLY=PowerSync`). The first table overstated the profile and is void for Zero:

- Chromium had served area, block and route from its HTTP cache, so those runs never reached the proxy; once the cache was cleared before each run, the proxy failed on Kit's `Link` preload header (over Node's 16 KB default, now raised).
- About 0.8 s of the profile's 1.27 s was dev photos failing to load (the seeded files do not exist); the probe now ignores image boxes.
- Zero's Chromium profile never got past the full-screen loading spinner (screenshot), which the probe read as settled; a spinner now counts as still loading. Zero's desktop numbers and its failed live update are void until Zero syncs in that profile.

PowerSync, median of 3, Playwright's Chromium, warm store:

| Screen  | First paint to settled | Navigation to settled |
| ------- | ---------------------- | --------------------- |
| Area    | 0.87 s                 | 1.21 s                |
| Block   | 0.78 s                 | 1.14 s                |
| Route   | 0.41 s                 | 0.74 s                |
| Profile | 0.46 s                 | 0.74 s                |
| Map     | 0.28 s                 | 0.64 s                |

Live update 0.06 s. Measured from first paint, every screen passes D13's 1 s bar; measured from navigation, which the user chose as the bar's reference (2026-11-14), area and block miss it by 0.21 s and 0.14 s. The profile's remaining time is its first-ascent route list, run as four route-list SQL statements of 190 to 330 ms each.

Area and block, traced the same day in Firefox with the SQL tracer (`TRACE_SQL`, which records each worker message with its parameters): both are sheets over the explore map, and the one SQLite worker runs every read in turn, the sync's own included. On `/areas/26` with a warm store, the map's blocks (141 ms) and areas (52 ms) and the sheet's route list (107 ms) ran before the sync's first read, so "connected" came 338 ms after the store opened, against 73 ms on the profile, which has no map behind it. An earlier note blamed a region-wide route scan (`ROUTE_MAP_SQL`) before the connect: the trace shows it starts after "connected", so that was wrong. Holding the map's reads until the guidebook is taken in moved "connected" on the block from 1.0 to 1.2 s to 0.43 to 0.51 s and the guidebook's confirmation to 0.55 to 0.70 s from navigation. The probe then ended on the map drawing behind the sheet (block 1.04 to 1.13 s), so the user chose to time sheet screens by the sheet (design D13). The map screen itself was unchanged (0.56 s from navigation).

Remeasured with the probe ignoring the map (median of 3, from navigation): area 1.16 s, block 1.22 s, map 0.64 s. The sheets' data is confirmed at 0.62 to 0.72 s; what still changes until about 1.15 s is the sheet's action bar (`ActionBar.svelte`), whose trailing group gains a button just after the map's data lands, likely an action that reads the map's data (not confirmed). The user accepted this (2026-11-14): the sheet's content is in place well under 1 s, only a late action button exceeds it.

Also on 2026-11-14: the dev Postgres crashed into recovery mode once during a live-update check (cause not visible: the container log is empty). Route 203's name was restored by hand. The live-update check now runs only on full measurements.

Task 8.14, 2026-11-15 (iOS 27.2 Simulator, iPhone 18 Pro, Safari, PowerSync-only production build after the rebase onto develop, `admin@`): route 203 open, Safari sent home for 5 minutes, the route renamed with `psql`, Safari brought back. Run 1: still the old name 7 s after resume, the new name by 17 s. Run 2, a screenshot every 1.3 s: the old name until 14.0 s, the new name from 15.2 s, no reload either time. No status banner showed in any frame of either run, so for about 14 s the page showed the old name while its status claimed it was current (the bar shows "reconnecting" only while the connection is not `connected`). Whether the client counted itself connected in that window is not visible from the Simulator; this check does not pass as written and is left open.

Also on 2026-11-15: map checks in the automated Firefox are not evidence. Its page reports `hidden` and renders about one animation frame every 2 s, and OpenLayers requests tiles and runs camera fits on frames, so missing tiles and an unframed sheet there (seen with and without the map-read gate) say nothing about the app; one fit finished 6 s late, on the next forced frame. Map rendering is checked in headless Chromium (`measure:screens`) instead. There, on the committed build with the gate, cold loads of area 26 and block 49 frame the sheet's entity beside the sheet with OSM tiles loaded (settled screenshots of 3 runs each); the gate causes no framing regression.

How long a backgrounded Safari page stays live, 2026-11-15 (same Simulator and build, route 203). PowerSync's web SDK never disconnects a hidden tab and has no ping (`@powersync/common` 2.5.0: no visibility handling; `connectTimeoutMs` only bounds the start of a stream); Zero disconnects a hidden tab after 5 minutes and pings every 30 s. Renamed right after Safari went to the background, the page showed the new name at once on return, for every background time from 10 s to 300 s: the change arrives before the page is frozen. Renamed after 10, 20, 30, 60 or 120 s in the background and resumed 3 s later, the page always showed the old name first and caught up 13 to 21 s after the return, with no status banner. So the page is frozen within 10 s of going to the background, and any change after that costs a 13 to 21 s catch-up on return, whatever the time away. A finer run the same evening, renaming 3, 3, 4, 6, 6 and 8 s after Safari went to the background: at 3, 3, 6 and 8 s the page was still live (the new name showed by the first or second frame, within 1 to 3 s of the return); at 4 s and once at 6 s it was frozen (caught up after 16 s and 9 s). So the freeze comes at no fixed time, anywhere from about 4 s to 10 s, and a page away for more than about 3 s may come back stale.

Task 8.14 re-run, 2026-11-15, on the build with design D14 (8.15, 8.16), same Simulator: away 5 minutes, route renamed at the end, Safari brought back. No bar at 0.7 s (the 1 s show delay), "Catching up. You might not see the latest changes yet." from 1.8 s, the new name and no bar from 22.9 s (still the old name at 21.9 s), no reload. Away 2 s with the rename started on leaving: the new name at once and no bar in any frame. The catch-up took about 22 s against 9 to 21 s before the fix (one run), so the forced reconnect may add a few seconds on WebKit; the bar now says so for the whole of it. The bar reads in both themes (`preset-tonal-warning`, one line at 1280 px; checked by computed style, since the automated Firefox does not paint).

Task 8.13 from a clean copy of 01a1c990, 2026-11-16 (iOS 27.2 Simulator, iPhone 17, Safari, warm store, `admin@`): the harness ran end to end. `MARKS=1 npm run measure:screens -- 3 Block`: Zero 1.15 to 1.61 s from navigation; PowerSync 1.94 s in one run and 21.3 s and 23.0 s in the other two (median 21.3 s), against 0.8 to 1.2 s in earlier runs. In the slow runs the client marked "connected" at about 0.9 to 1.4 s and the guidebook "synced" at about 21 to 23 s, while the PowerSync service log shows each of those streams' checkpoint complete within 16 to 33 ms of the stream starting, one stream per run (so the D14 restart did not fire). The time is lost in the client between the server sending the checkpoint and the client applying it. It matches the 20.6 s WebKit stall on route 203 (task 8.11) and the 13 to 22 s catch-ups of task 8.14. Cause not investigated; one guess, unchecked, is that WebKit holds the small streamed response until the next server keepalive.
