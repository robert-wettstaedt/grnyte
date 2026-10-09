> **Execution order: 9 with 11, then 1, 10, 2, 3, 4, then 12, 13 and 15 (done), then 14.1 to 14.5,
> then 5 to 7 in parallel, then 14.6 to 14.10, then 17, then 16, 8 last.**
>
> Group numbers are the order these were written, not the order they run. They are kept as they are
> so the completed boxes in groups 1 and 2 stay meaningful. The order above follows the migration
> plan in design.md, which was revised once measurement separated four problems rather than one.

## 1. Remove wasted query registrations

Ships before any measurement, so the baseline has a clean floor.

- [x] 1.1 Debounce the search input so a keystroke does not register a new Zero query per stroke, and
      verify with the prod-style inspector table (or the dev equivalent) that typing a word produces
      one registration per settled term rather than one per character
- [x] 1.2 Gate `usersByIds` with `enabled` so it does not register when its id list is empty, and
      verify the query no longer appears in the inspector table on a page where no ids resolve
- [x] 1.3 Gate `blockTopos` with `enabled` so it does not register when its block id list is empty,
      verified the same way
- [x] 1.4 Add a relation-free notification query variant in `src/lib/entities/notification/`
      (queries, dto, resource) and point the unread badge at it, keeping the existing query for the
      inbox screen, and verify the badge still renders the same number while the inspector shows the
      bare-row query in its place

## 2. Baseline measurement

- [x] 2.1 Record the current `ZERO_NUM_SYNC_WORKERS` value from Bitwarden into the change notes, and
      verify it is written down before any deploy so the later numbers can be read against it
- [x] 2.2 Capture a cold feed-page baseline on production by TYPING `/feed` into a fresh tab, never
      by clicking into it, and verify the capture is saved durably and that
      `blockTopos({blockId:[]})` and the fat `listNotifications({limit:100})` are absent. If either
      is present, step 0 is not deployed and this is not the baseline
- [x] 2.3 Capture the same after clicking to Explore and back, no reload, and verify both captures
      are the same account and tab so step 4 has a comparable pair. Expect MORE queries than the
      cold reading: `/explore`'s four unbounded queries join and never leave, which is the deferred
      leak and not a mistake in the capture

## 3. Relocate the client view records

- [x] 3.1 Add a Postgres container with a named volume beside zero-cache in
      `deployment/docker-compose.zero.yml` and `docker-compose.yml`, and verify it starts and
      accepts a connection locally before any production change
- [x] 3.2 Create the `ZERO_CVR_DB` secret in Bitwarden and add its mapping to
      `.github/workflows/deploy-zero.yml` for the production environment. Demo is being sunset and
      its CVR container was dropped, so there is no non-production environment to rehearse the
      deploy against. Verify the risk that rehearsal was aimed at instead: that zero-cache
      bootstraps its own schema into an EMPTY database, by running it locally under a throwaway
      `ZERO_APP_ID` against a fresh Postgres 17 container, so the cutover needs no manual
      bootstrap step
- [x] 3.3 Document the variable in `deployment/README.md`, including the explicit reason the
      database is not backed up, and verify the note names `backup-db.yml` so a future maintainer
      finds the rationale where they would look
- [x] 3.4 Deploy the cutover at low traffic, leaving the previous database untouched, and verify by
      loading the app that clients re-sync and reach a working state
- [x] 3.5 Re-measure the feed page cold and warm exactly as in task 2, THREE captures of each, and
      verify the verdict is read off median `hydrateServer` per query rather than `hydrateTotal`.
      `listBlocks({})` at roughly 2000 ms of server time is the number that has to move; if it does
      not, the cutover did not help whatever the totals do

## 4. Recent query retention

PRECONDITION, established in group 10 and written up in design.md: nothing de-registers a query
within a page's life, and `maxRecentQueries` only evicts queries that HAVE been released. Until the
deferred resource-lifetime item lands, this group can only measure a no-op. Do not read a flat
result as "the lever did not help".

- [ ] 4.1 Confirm the precondition still holds before changing anything: walk three screens and
      verify the inspector's query count only grows. If it now falls when a screen is left, the
      deferred item has landed and the rest of this group is worth running
- [ ] 4.2 Set `maxRecentQueries` to 20 in the Zero client options in `src/lib/zero/z.svelte.ts`, and
      verify the inspector shows queries surviving a back-navigation rather than re-registering
- [ ] 4.3 Re-measure the feed page cold and warm, three captures of each, and verify against median
      `hydrateServer` as in 3.5 rather than against wall clock
- [ ] 4.4 Record the gate outcome in the change notes: whether steps 3 and 4 moved the numbers, and
      therefore whether the deferred structural items are triggered, verified by the recorded
      measurements rather than impression. If 4.1 showed the precondition still holds, record that
      step 4 measured a no-op by construction rather than a lever that did not work

## 5. The readiness signal

Independent of tasks 1 to 4 and may land in parallel on its own branch. Runs AFTER group 12: it is
the backstop for the gap deferral cannot close, not the primary fix for the feed. Runs BEFORE 14.6:
the composite resource implements its members.

- [x] 5.1 Add the latched readiness member to `QueryResource`. Already shipped as `settled` in
      936d6c10, after this plan was written: latched on the view, which `ViewStore` keys on the
      request hash. `settled.test.ts` covers it staying true after `isComplete` drops
- [x] 5.2 NOT DONE, superseded, and left here so the reason survives. The plan had the edit forms seed
      from a renamed strict member. 936d6c10 and AGENTS.md moved them onto the latch instead, because
      `isComplete` drops when the socket parks and tore a form down mid-edit. A latch keyed on the view
      only rises once that request's rows were whole, and the `known` fingerprint still refuses a
      submit that no longer matches the server. The strict member stays `isComplete`
- [x] 5.3 NOT DONE, superseded by the same decision as 5.2: `updateRoute`, `updateBlock` and the topo
      line modal seed from `settled`, the topo editor captures its fingerprint at the first edit, and
      the map-layers form gates on its membership row's own `synced` and `layersComplete`
- [x] 5.4 Redefine `isEmpty` as settled-and-empty (`resolveEmpty`), which also counts an empty
      offline answer `resolveAvailability` vouches for. `settled.test.ts` covers it, each case seen
      red by a mutant. `QueryState` now tests `isEmpty` ahead of `loading`, so a confirmed absence
      no longer renders a skeleton when Zero reports `unknown`
- [x] 5.5 `remoteResource.isEmpty` requires a first answer too, with a test seen red
- [x] 5.6 Add the `syncing` snippet and its default branch to `QueryState`: a `StatusPill` pinned
      at the top of the ready rows while `!settled` and online, in the map loading pill's look (now the
      same component), flying in through `motion()`. It overlays rather than pushes, so it never shifts the
      list. The feed shares the slot with its "N new" pill, which takes precedence.
      `forceState="syncing"` renders it
- [x] 5.7 Add `queryState_syncing` to BOTH `messages/en.json` and `messages/de.json`
- [x] 5.8 Add the syncing state to `QueryState`'s Storybook stories, and verify it renders in
      `npm run storybook` in both light and dark

## 6. Call sites

- [x] 6.1 Sweep every `QueryResource` consumer for sites matching the known wrong patterns, not only
      the two already found, and verify by recording the resulting list with file and line in the
      change notes before any fix is made
- [x] 6.2 Fix `src/routes/(app)/routes/[id]/+page.svelte` so a loading ascents query no longer
      renders an offline notice, and verify by driving the page against a throttled connection that
      it shows the readiness affordance and then the data
- [x] 6.3 Fix `src/routes/(app)/routes/[id]/ascents/+page.svelte` the same way, and verify the filter
      chips and header tally are no longer hidden while merely loading
- [x] 6.4 Fix any further sites the sweep in 6.1 found, one reviewable edit each, and verify each
      against the list recorded there

## 7. Vocabulary and regression cover

- [x] 7.1 Extend `src/lib/zero/availability.test.ts` (or its current equivalent) to cover the
      readiness states, and verify each new test has been seen red by inverting one branch of
      `resolveAvailability` before relying on it
- [x] 7.2 Name the readiness states in `CONTEXT.md`, and verify the terms used in code, copy and
      spec match what is written there

## 8. Verification sweep

Over the touched paths and nothing else, per AGENTS.md.

- [x] 8.1 Run `npx prettier --write` and `npx eslint` over the touched paths, and verify both exit
      clean
- [x] 8.2 Run `npx vitest run --project server` for `*.server.test.ts` and `*.remote.test.ts` and
      `--project browser` for the rest, and verify both pass. Three data-dependent failures after the
      Volume Test reseed were fixed in the tests (region picked by change-carrying events, fixtures
      pinned to the month's start); 2026-10-02: browser 1765/1765, server 622 passed, 9 skipped
- [x] 8.3 Typecheck with `./node_modules/.bin/svelte-check --tsconfig ./tsconfig.json` beside the
      running dev server, and verify it reports no new errors
- [x] 8.4 Run `npm run lint:duplication` and `npm run lint:unused`, and verify no clone is marked
      NEW and nothing unused was introduced
- [x] 8.5 Drive the running app at BOTH 375x667 and 1280x800 across a list surface, a detail page
      and an empty state on a throttled connection, and verify the three readiness conditions are
      visually distinguishable at both sizes

## 9. Resume latency (problem A)

Runs FIRST. Client-side only, no deploy coupling, and it targets the complaint that prompted this
change. See design.md, "Tighten the ping timeout on evidence, rather than globally".

- [x] 9.1 In `src/lib/state/online.svelte.ts`, expose the condition that means "the network answers
      but Zero still believes it is connected", from the reachability probe already running on
      resume, and verify with a unit test over the pure inputs rather than by driving a socket
- [x] 9.2 Tighten `pingTimeoutMs` on the live client while that condition holds and restore Zero's
      default once the connection is re-established, in `src/lib/zero/z.svelte.ts`, and verify by
      typecheck that the property still exists on the client (an upgrade removing it must fail the
      build, not silently no-op)
- [x] 9.3 Prove the behavior end to end: with the app open, kill the socket without closing it
      (DevTools offline toggle leaves the client believing it is connected), restore the network,
      and verify new rows arrive in roughly `2 x` the tightened value rather than 10 seconds
- [x] 9.4 Confirm the steady-state path is untouched: with no resume and no failed probe, verify the
      client still reports Zero's default so behavior on a weak connection is unchanged
- [ ] 9.5 File the behavior upstream at bugs.rocicorp.dev, since no existing issue covers it and
      the option is undocumented, and record the issue link in the change notes

## 10. Why the map queries register on the feed (problem B)

Diagnostic, and it runs BEFORE any decision about the map. Cheap to answer and it may remove most of
the 2938 ms without an architectural change.

- [x] 10.1 Establish why `listBlocks({})`, `listAreas({})` and `listRoutesForMap({})` are registered
      on `/feed` rather than only on `/explore`, and verify the answer by naming the component or
      layout that reads them there, with file and line
- [x] 10.2 Record in the change notes whether the fix is scoping (a surface staying mounted across
      the shell) or architectural (the map genuinely needs Zero), and verify the recommendation
      against a measured feed capture rather than reasoning alone
- [x] 10.3 NOT APPLICABLE, and left here rather than deleted so the reason survives. Its precondition
      was "only if 10.2 says scoping". It does not: the feed never registered those queries, so there
      is nothing on it to scope. What 10.2 found instead is deferred, see design.md. That holds for
      a browser tab only: on an installed device the offline preload registers the same queries on
      every open, which group 12 addresses

## 11. Device-local resume diagnostics (problem A)

Runs with group 9, since it is how 9's fix is judged on real hardware. Temporary instrumentation for
a gate decision, so it is written to be removed in one commit. Nothing leaves the device.

- [x] 11.1 Add a capped ring buffer in `localStorage` recording only resumes that needed a
      reconnect, with the append and eviction as a pure function, and verify with a unit test that
      the cap holds and the oldest entry is the one dropped
- [x] 11.2 Record an entry from the reconnect path added in group 9, so a resume that did NOT need
      one writes nothing, and verify by driving the app that a healthy resume leaves the buffer
      untouched while a killed socket adds exactly one entry
- [x] 11.3 Handle `localStorage` being unavailable or throwing (private windows, blocked site data)
      so a diagnostic can never break the app, and verify with a unit test that a throwing store is
      swallowed
- [x] 11.4 Add a "this device" section to `src/routes/(app)/settings/errors/+page.svelte` rendering
      the buffer newest first with a clear action, and verify by driving the page at BOTH 375x667
      and 1280x800 that it reads correctly and that an empty buffer renders an empty state rather
      than a blank panel
- [x] 11.5 Add the section's copy to BOTH `messages/en.json` and `messages/de.json`, sorted and
      under one domain prefix, and verify no key exists in only one file
- [x] 11.6 Record the removal trip-wire in the change notes: what to delete, and that it goes once
      the gate in 4.4 is decided, verified by the note naming the files rather than describing them

## 12. Defer the offline preload (problem A, second half)

Runs BEFORE groups 5 to 7: it removes most of the wait those groups would otherwise only describe.
See design.md, "Defer the offline preload until the visible screen is answered". The before
numbers are the five field-device runs in the notes.

- [x] 12.1 Move `preloadForOffline(z)` in `src/lib/zero/z.svelte.ts` behind the trigger the design
      names, and verify by driving a field-device session (the `offlineData` override) that the
      inspector shows the feed's queries answered before `listRoutes({})` registers
- [x] 12.2 Verify offline is unaffected: once the deferred sync completes the `guidebook` stamp
      still lands, and a route page renders offline with its related rows
- [x] 12.3 The gate: rerun the field-device measurement (fresh client groups, `/feed` typed
      directly, every tab of a profile closed for at least 10 s between runs), five runs, and verify
      the pill lands in under 2 s in ALL five, against three of five at ~15 s before. Record the
      result in the change notes. PASSED on its five (median 1,075 ms). Two later opens exceeded 2 s
      and both are traced in the notes: one to the deferral's CVR churn landing before the first
      batch finished, one to a reconnect caused by the guidebook's hydration (group 14)

## 13. A TTL on the guidebook preloads (rejected)

Kept so the reason survives: it is the obvious next idea for the churn in design.md, and it fails.

- [x] 13.1 Measure the churn the deferral causes on the local client view records, and verify by
      counting row records rewritten by one open: 10,167 of 10,361 at `'none'`, and 1,977 (all
      keyed-preload rows, no guidebook rows) at `ttl: '10m'` on the three arg-less queries
- [x] 13.2 Decide from the zero-cache log, not from timings, whether a cached inactive guidebook is
      hydrated in a cold view-syncer's first batch, and verify by naming the queries hydrated between
      `hydrating N queries` and `finished processing queries`. It is (`hydrating 20 queries` with
      `listRoutes`, `listBlocks`, `listAreas` inside), which undoes the deferral, so the TTL is
      rejected and was reverted uncommitted

## 14. The guidebook's hydration and the dead-connection threshold

See design.md, "Flatten the guidebook into relation-free preloads", and the spec requirement that
synchronizing the guidebook does not drop the connection.

- [x] 14.1 Take the offline-scope decision. Decided: unchanged, every route in every region with
      everything a route page shows (design.md, "Flatten the guidebook into relation-free preloads")
- [x] 14.2 Choose the guidebook's shape, recording the choice and the rejected options in design.md.
      Decided: flatten everything, measured on the harness
- [x] 14.3 Add `src/lib/zero/guidebook.ts` with the nine region-gated `guidebook*` queries,
      registered in the query registry, and verify with a tenancy test seen red that none returns
      another region's rows
- [x] 14.4 Replace the three guidebook preloads in `preloadForOffline` with the `guidebook*` set,
      stamping `guidebook` only when all complete, and verify on the harness over six cold opens.
      The 3 s / 1 s gate came from the bench; through the real path the batch is CPU-bound at a
      steady ~4.2 s (notes, "14.4"), so the harness gate is median span under 5 s, no query over
      2.5 s, no open over 7 s. Met: 4,160 ms median, worst query 2,032 ms, worst open 6,106 ms
- [x] 14.5 Make `offline.ts` list the `guidebook*` queries as `field` and `listRoutes`,
      `listBlocks` and `listAreas` as covered by them. Extend `offline.drift.test.ts` to walk each
      covered query's AST and fail on any table outside the guidebook set, and see it red by adding
      a relation to `listRoutes`
- [x] 14.6 After group 5, add the composite `QueryResource`: registers named queries, reads a
      local-only `zql` query, ready when all registered queries complete, latched on their hashes,
      offline policy taken from them, strict member mirroring the latch with a comment saying why.
      Verify with unit tests each seen red, plus a test that its local read touches no table outside
      the registered set
- [x] 14.7 Move `exploreData` (the map, `CreateOnMap`, both location pickers) onto the composite
      resource, and verify the map renders the same blocks, areas and parking at 375x667 and
      1280x800, and that the inspector shows no `listBlocks({})` or `listAreas({})` registered on
      /explore
- [x] 14.8 Point the /explore empty-region card at the flat areas query, and verify it shows for an
      empty region and does not flash while syncing. Pointed (`areaMapList`), and no flash on two cold
      loads at 375. Verified 2026-10-09 on 9a3f3275 with test@ moved to a throwaway empty region:
      cold at 375 the card appears once (0.5-0.7 s) and stays, admin and read-only copy both; back
      on its real region no card in 9 s of 30 ms samples. Region deleted, membership restored
- [ ] 14.9 Verify on prod over five field-device opens that the median guidebook batch is under 4 s
      (target raised from 3 s on 2026-10-09, after measuring), no guidebook query exceeds 1 s, no
      ping-related `client closed` appears, and the feed pill appears in under 2 s. Run 2026-10-09 on
      63090531: guidebook 3,763 ms median, slowest query 653 ms, no ping closes, all pass; feed first
      window 3,673 ms median, FAILED, queued behind the nine guidebook queries. One query at a time
      (fee391ef) fixed the feed (493 ms) but doubled the guidebook (7,654 ms). Now: the batch again,
      sent once the first screen has asked for its rows (harness: card 1.06-1.55 s, guidebook as
      before). Re-run on prod
- [x] 14.10 Read the replica's query plan for the feed's window query (`region_fk IN (SELECT value
FROM json_each(?)) ORDER BY created_at desc, id desc`) and verify whether the composite index
      is used. Record the answer; change nothing unless the plan shows a sort over the whole table

## 15. A prod-shaped, prod-speed local harness

Runs BEFORE 14.4, whose gate it lets run locally. See design.md, "Measure against a prod-shaped,
prod-speed local harness", for the targets.

- [x] 15.1 Extend `src/lib/db/scripts/seed-volume.ts` with what prod has and the seed lacks: topos per
      block, topo lines per route, first ascensionists per route over a shared pool, events, routes
      per block on a skewed distribution, and areas nested to depth 4. Verify by running the prod
      shape query against the reseeded region and matching the design's table within ~10%
- [x] 15.2 Reseed Volume Test to those targets with `RESET=true`, and verify with the inspector as a
      member that `listRoutes({})` returns near 19,860 rows and `listBlocks({})` near 6,167
- [x] 15.3 Add the opt-in `perf` profile to `docker-compose.yml` (prod's `rocicorp/zero:1.9.0`, a
      `cpus` cap, `ZERO_NUM_SYNC_WORKERS=2`, `ZERO_CVR_DB` on the local `cvr` container), and verify
      the app syncs through it on :4848 with `npm run dev:zero` stopped and that `docker logs -t`
      shows the view-syncer lines prod shows
- [x] 15.4 Calibrate the cap until `listRoutes({})` costs ~0.47 ms per row and hydrates in ~9 to 10 s,
      and record the value in the profile with the measurement beside it
- [x] 15.5 Acceptance: reproduce both prod signatures (pill ~15 s with the deferral reverted and
      ~1 s with it; a ~9 to 10 s guidebook hydration with an occasional `client closed`) and record
      the runs in the change notes. If the disconnect does not reproduce, say so and keep judging
      14.3 on prod

## 16. Secondary content gets its space decided before it loads

See design.md, "Secondary content: decide its space before it loads", and notes.md, "Secondary
loads". Buckets: 1 known in advance (reserve exact space or nothing), 2 unknown with an empty state
(always render, skeleton then content or empty), 3 unknown without one (placed low, appends), 4 never
insert above rendered content. The bucket per section below is proposed; confirm before building.

- [x] 16.1 Fix the false "No location" on a sector without parking while its blocks load: the line is
      withheld while `locating` (no parking and blocks not settled)
- [x] 16.2 Skeleton primitives in `$lib/components/`: a row, an image at a given aspect ratio, a
      horizontal strip, a chart. Each appears only after ~250 ms, stills under reduced motion, and
      has a story. Verify with a story per shape at 375 and 1280, light and dark
- [x] 16.3 `/routes/[id]`: hero topo bucket 1 (reserve the ratio when the route row has a line; the
      "Draw this route on a topo" row for region editors; nothing for read-only), ascents bucket 2
      (skeleton rows, then rows or "No ascents yet"), grade opinions bucket 2 under the original
      grade, media bucket 1 for editors and bucket 3 for read-only (moved below the late sections),
      history line bucket 3, breadcrumb crumb bucket 1 (the block id is on the route row)
- [x] 16.4 `/areas/[id]`: blocks list and sub-area list bucket 2 (skeleton rows, then the list or the
      existing empty states), histogram bucket 4 (reserve while routes load), "All routes" card
      bucket 2, referenced-by and history line bucket 3
- [x] 16.5 `/blocks/[id]`: topo strip bucket 2 (reserved `h-60` strip, then photos or the existing
      "Add topos" action for editors and nothing for read-only), routes bucket 2, referenced-by and
      history line bucket 3
- [x] 16.6 Topo viewer: the stage reserves the image while it loads (bucket 1, the topo row carries
      the file's dimensions)
- [x] 16.7 Profile: heatmap and grade pyramid bucket 4 (reserved at their fixed size above the
      sessions), first-ascent line bucket 1 or 4, favorites skeletons gain their heading
- [x] 16.8 Search: later groups append below the first rather than re-ranking above it (bucket 4)
- [x] 16.9 Regions and settings: invitations bucket 4 (reserve or move below), seat count withheld
      until invitations load
- [x] 16.10 Feed: person chip keeps its width while the name loads; filter-sheet people rows get
      skeleton rows
- [x] 16.11 Forms: "Previous notes (n)" count waits for settled; first-ascent suggestions get a
      skeleton row while unsettled
- [x] 16.12 Drive each touched page cold on the harness at 375 and 1280 and record that no section
      inserts above rendered content and no reserved space collapses when the answer is "none"

## 17. A page's chrome renders in every state

Runs BEFORE group 16: a missing back button strands a reader, and group 16's skeletons can only be
judged at the right width. See design.md, "A page's chrome renders in every state, not only when
ready".

- [x] 17.1 `Form` loading mode: header with Cancel and a fallback title, Save disabled, body skeleton
      inside `Form`'s own width, nested resources awaited inside it. Verify with a story per state
      and that Cancel works while loading
- [x] 17.2 Move the form pages onto it: `routes/[id]/edit`, `routes/[id]/ascents/add`,
      `areas/[id]/add`, `areas/[id]/edit`, `areas/[id]/blocks/add`, `areas/[id]/parking/edit`,
      `ascents/[id]/edit`, `blocks/[id]/edit` and `blocks/[id]/move` (via `BlockEditor`),
      `blocks/[id]/routes/add`, `areas/[id]/blocks/order`. Verify each shows its header on a cold
      deep link and one skeleton, not a sequence
- [x] 17.3 Detail pages: `routes/[id]` and `routes/[id]/ascents` render `PageHeader` and their width
      container outside `QueryState`, title falling back, breadcrumb and grade filling in; the sticky
      "Log ascent" footer only once the route is ready
- [x] 17.4 Smaller cases: `events/[id]` moves its container out; `users/[id]`'s loading back button
      sits where the loaded one does; `ascents/[id]` keeps a header while it redirects; the area and
      block explore sheets get a fallback title like parking and topo
- [x] 17.5 Separate defect found on the way: the topo viewer's stage (`md:right-80 lg:right-96`) is
      narrower than its panel (`w-94 lg:w-105`), so part of the image sits under the panel
- [x] 17.6 Drive every page above cold at 375 and 1280 in the loading, not-found and offline states,
      and record that the header and width never change between loading and ready
- [x] 17.7 Separate defect found driving 17.6 offline: `isLoading` read the raw status, so a reader
      with no app role (or no region) has a confirmed-empty answer that offline never completes, and
      the whole app sat behind "Nothing downloaded yet" with a full local copy. A confirmed absence
      now counts as answered (`resolveLoading`). Verify by reloading offline on a synced device
