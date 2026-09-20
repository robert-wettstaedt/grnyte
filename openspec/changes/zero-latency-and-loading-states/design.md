## Context

See proposal.md for motivation and the four-problem table. The constraints that shape the approach,
all established by measurement rather than assumption:

- **SUPERSEDED, kept because it explains an earlier decision**: "query execution is fast and the wait
  is queue time" (server 0.8 to 34.5 ms against `hydrateTotal` up to 3352 ms). That was measured on a
  block and route page, whose queries are all small, and it does not generalize: where unbounded
  queries hydrate, server work dominates.
- **The heavy page is `/explore`, not the feed.** A feed opened directly is 503 ms with ~321 ms of
  server work. Drawing the map is 4607 ms, of which `listBlocks({})` alone is 2081 ms. An earlier
  reading blamed a "cold feed" at 3810 ms; that capture had been clicked into from `/explore` and
  carried its queries along, which is the leak below rather than anything the feed does. A reading is
  only cold if the tab has been nowhere else.
- Because nothing releases a query, `/explore`'s four unbounded queries stay registered for the rest
  of the session. The 4.6 s is paid once; the registrations are not.
- `ZERO_NUM_SYNC_WORKERS` is 2 on a 2-core box, and one client group is served by one worker, so a
  page's server-side hydration serializes. Any improvement measured after moving the client view
  records must be read against this rather than as "Zero got faster".
- While Zero has not yet noticed a dead socket it reports `connected`. So `connectionVerdict` returns
  reachable, `isOnline()` is true, `StatusBar` shows nothing and every resource still reports
  complete. No layer in this app can detect that state, which is why it needs its own fix rather
  than a loading state.
- Client view record cost is per row, not per column or per query. `src/lib/zero/offline.ts` records
  this; production measures ~352 bytes per row and 5.25 MB per client group. A relation-free variant
  of a query helps only because it pins fewer rows.
- Offline, no query ever reports complete: the client resets its authority flag on every disconnect.
  Any readiness signal that is not latched therefore regresses whenever the socket parks, which is
  routine when a phone goes into a pocket.
- `updateRoute`, `updateBlock`, `saveTopoLines` and `updateRegionMapLayers` delete what a submission
  leaves out. Each carries a `known` fingerprint from `$lib/forms/fingerprint.ts` seeded off
  server-confirmed completeness. A latched value used in that position is silent data loss.

All reads discussed here are Zero queries reached through the entity modules in
`src/lib/entities/<name>/resources.svelte.ts`. No write path changes in this change: mutations
remain SvelteKit remote functions and the write-side compensation for sync lag is explicitly
deferred. **There is no schema change, so no migration and no backfill.**

### Judge the gate on `hydrateServer`, and do not attempt an A/B

`hydrateTotal` carries the client's whole network path and is far too noisy to judge anything by. Two
nominally identical cold captures of the same page on the same account read 503 ms and 882 ms, a 75%
swing, which is larger than any effect this change expects to produce. Per-query `hydrateServer` over
the same captures moves ~9% (`listEvents({limit:50})`, 145.5 to 132.7 ms) and ~12% (`listBlocks({})`,
2104.8 to 2081.3 to 1868.6 ms). It is also the half that relocating the client view records should
move, since those reads and writes happen server-side during hydration. So the gate reads median
`hydrateServer` per query across three captures, and treats `hydrateTotal` as context.

**A side-by-side deployment cannot substitute for this.** Two things rule it out, both worth writing
down so the idea is not re-proposed:

- There is one zero-cache, and `ZERO_CVR_DB` is its setting. Moving the records moves them for every
  client at once, so prod-CVR and VPS-CVR cannot run at the same time and there is nothing to
  interleave.
- A preview origin cannot exercise a NEW named query at all. `ZERO_GET_QUERIES_URL` is a
  zero-cache-side variable pointing at one environment's app, so a preview client's queries are
  transformed by the PRODUCTION app. Observed: `countUnreadNotifications` on a preview reported
  `server: null, total: null` while a legitimately empty query in the same capture reported real
  metrics, and the notification badge reads zero regardless of the true count.

## Goals / Non-Goals

**Goals:**

- Attribute the latency to one cause per measured step, rather than shipping a bundle and guessing.
- Move the readiness judgement into the layer that holds the evidence, so no surface re-derives it.
- Make the correct behavior the default, so the ~26 surfaces deriving values from partial
  collections do not each need a judgement call.

**Non-Goals:**

- A latency target. The gate compares against a baseline taken on the same page and account; there
  is no number to hit.
- Reworking any surface's visual design. The readiness affordance is per surface and reuses existing
  vocabulary.

## Decisions

### Tighten the ping timeout on evidence, rather than globally

Zero detects a dead socket in `2 x pingTimeoutMs`, which at the default 5000 is ten seconds, and
`zeroOptions` never sets it. The option is public and not readonly, both use sites read
`this.pingTimeoutMs` fresh rather than capturing it at construction, and its own comment says a new
value takes effect on the next ping cycle. So it can be changed at runtime.

`src/lib/state/online.svelte.ts` already has the signal needed to know when to. Its resume handler
runs a reachability probe that answers in about a millisecond. A probe that SUCCEEDS while Zero
still reports `connected` is positive evidence that the socket is dead and Zero has not noticed:
the network works, so a short pong deadline is safe precisely there. Tighten for that window,
restore the default once reconnected.

Rejected alternatives:

- **A globally lower `pingTimeoutMs`.** It trades a ten second wait after a push for a shorter pong
  deadline everywhere, including one bar of signal at a crag, which is the case this app exists for.
  A false timeout costs a reconnect, and a reconnect costs a client view record diff, which is the
  expensive thing.
- **`z.connection.connect()` on resume.** Ruled out on evidence rather than preference:
  `connection.d.ts` states that if Zero is already `connected` it sends an auth update "without
  reconnecting", and that it "does not reconnect from `disconnected` or `closed`". In the window
  that matters the state IS `connected`, so this would push an auth update into a dead socket.
- **Doing nothing and covering it with a loading state.** Impossible. Nothing in the app can detect
  the condition; see the last Context bullet.

### Deferred: queries are never released within a page's life

Measured in dev with real in-app navigation, not inferred. A fresh `/feed` registers 11 queries and
none of the unbounded map ones. `/explore` adds four. Returning to `/feed` keeps all four, for over a
minute, with the map's DOM entirely gone. Walking feed, profile, feed, explore, feed, profile the
count goes 15, 23, 23, 23, 23, 23: it grows to the union of everywhere the session has been and never
shrinks. Task 10 assumed these were registered BY the feed. They are not.

Mechanism: `createResource` builds a zero-svelte `Query` inside a `$derived` and calls
`view.ensureSubscribed()`. Nothing is paired to it. `Query.destroy()` exists and is never called on a
resource's query, so the subscription outlives the component, and re-deriving on an argument change
abandons the previous Query still subscribed.

**Deferred rather than fixed, because it has already been tried.** `memlab/` settled the same root
cause with a full 2x2 and reverted it in `9a0ba6f4` and `a68586b9`: closing the roots clears the
detached cluster but costs about 6 MB per navigation, against a 3.6 MB one-time cluster. The reason
it costs that is the same reason it would help here. The teardown drops the shared ViewWrapper's last
subscriber, so the next visit re-materializes the whole query, which IS the de-registration this
change wants. That trade was decided on memory before anything was known about what an unreleased
query costs in registrations, rows pinned per client group, or server hydration. Reopening it needs
that second axis measured, not a new idea about memory.

Two consequences for the plan, both recorded rather than acted on:

- **`maxRecentQueries` cannot do anything while nothing de-registers.** It evicts queries that have
  been released. Step 4 is gated on this in tasks.md so a null result is not read as "the lever did
  not help".
- **C's roughly 920 ms of non-server time may be leaked registrations rather than distance to the
  client view records.** That would weaken the case for step 3, which was argued before this was
  known. Not asserted: it needs the numbers from step 3 to separate the two.

Upstream defect either way: zero-svelte's `Query` constructor opens a detached `$effect.root` that
captures the current component context, and closing it also dematerializes the view.

### Record resume diagnostics on the device, not on the server

A resume that needed a reconnect is appended to a small capped ring in `localStorage`, and
`/settings/errors` grows a section that reads it back. `localStorage` rather than memory on purpose:
the device that hits this is a phone, minutes or hours before anyone looks at it, so a buffer that
does not survive a reload answers nothing.

Only emitted when a reconnect actually followed, so a healthy resume writes nothing and the entry
count is itself the answer to "how often does this happen".

Rejected alternatives:

- **Rows into `client_error_logs`.** Its read query groups by `error` text and takes the newest 100
  groups, so a distinct timing per sample would be a distinct group and would push real error groups
  out of the window. Workable only with pre-bucketed strings. The admin alerter also mails every
  unalerted row, so it would need an exclusion in the shape of the existing `[adminAlert]%` one. And
  it would be this app's first behavioral telemetry, with no opt-out anywhere in it.
- **A tethered Safari Web Inspector session.** Free, needs no code, and Zero logs
  `ping failed in ... ms - disconnecting` at `info` level so it is visible in a production console.
  Unavailable: no device to hand.

Accepted limitation: `/settings/errors` is app-admin gated, so this reads back on admin devices
only. That covers the device the complaint came from, and it is a sample of one rather than a
distribution. If one device proves insufficient, the rejected server-side option is the next step
and carries the privacy decision with it.

### Co-locate the client view records rather than shrink them

`ZERO_CVR_DB` points at a Postgres container on the VPS beside zero-cache. Rejected alternatives,
each ruled out on evidence rather than preference:

- **Reduce rows pinned via per-region offline opt-in.** Breaks the `/explore` query hash dedupe:
  `src/lib/map/exploreData.svelte.ts` registers `blockList(() => ({}))` and `areaList(() => ({}))`,
  which currently hash-match the preload and cost nothing extra. Bounding the preload makes the
  map's unbounded queries a second registration, so the record set grows for anyone opening the home
  screen. It is also unshippable without a per-region sync stamp, since `src/lib/state/sync.svelte.ts`
  has exactly two stamps and `resolveAvailability` treats a synced guidebook as authority to call an
  empty result an answer. And the axis cannot reach the target: the largest region holds 4,550 of
  6,433 routes.
- **Query time-to-live on the preloads.** Time-to-live is only consulted for queries that have gone
  inactive, and a preload that never calls cleanup never does.
- **Narrower column projections.** Record cost is per row.

### Ship as separately measured steps

Six of them now, listed in the Migration Plan below. Bundling was the
original plan and was abandoned once a specific interaction surfaced: `maxRecentQueries` defaults to
0, so a superseded query is dropped immediately, and raising it means superseded queries linger. The
feed grows its window rather than paging, so its superseded windows would linger too, on the page
reported as slowest. Rarely grown in practice, so this is insurance rather than a likely regression,
but it is exactly the kind of interaction a bundle hides.

### Latch readiness on the query hash, not a caller-supplied key

The parked design in `src/lib/zero/resource.svelte.ts` calls for a latch "per id", but the resource
has no notion of an entity id: its identity is the query request. Keying on the hash is correct by
construction, since `listRoutes({ routeId: 5 })` and `{ routeId: 7 }` differ, so a form moving
between entities re-latches without the page arranging it. A caller-supplied key reintroduces the
per-page latch this refactor exists to delete, and `src/routes/(app)/routes/[id]/edit` is the worked
example of how fiddly that is to get right. Known consequence: pagination changes arguments and so
un-latches. `src/lib/entities/event/feed.svelte.ts` already owns `hasMore` and `newCount` for that,
so it absorbs it rather than the latch key bending to accommodate it.

### Two members, and the strict one is renamed

`QueryResource` keeps a strict, server-confirmed member alongside the latched one, and the strict
member is renamed so it reads as special-purpose (for example `serverConfirmed`) with a comment
naming the fingerprint guards as its only callers. One member is not an option: the fingerprint
guards need the unlatched value and everything else needs the latched one. The rename is the guard
against a future call site reaching for the shorter, friendlier name and silently getting a latched
value.

### `availability` stays at five values

The readiness signal is a separate boolean, not a sixth member of the `Availability` union in
`src/lib/zero/resource.svelte.ts`. The union answers "may I state this as fact"; readiness answers
"is more expected". They are orthogonal, and a sixth member would churn every exhaustive switch plus
the `resolveAvailability` truth table that exists precisely because this judgement kept being
re-derived incorrectly.

### Make the absence claim correct by construction

`isEmpty` becomes `settled && rawEmpty` rather than today's `status === 'ready' && rawEmpty`. Every
absence claim in the app already routes through `isEmpty` or `QueryState`'s empty branch, so one
line fixes them together. The alternative, a documented rule plus judgement at ~26 sites, is what
produced the two existing wrong sites in the first place. Values that describe only the rows on
screen read `.data.length` directly and are untouched.

### Readiness presentation is a snippet, not a mandated treatment

`src/lib/components/QueryState/QueryState.svelte` gains a `syncing` snippet with a default, exactly
as `loading`, `empty` and `error` already work. A single treatment does not survive contact with a
feed card, a grade histogram and a route list. `src/lib/components/QueryState/remoteResource.ts`
implements the same interface and must gain the new member too.

### The affordance never times out

A timeout would convert "slow" into "stalled", which the client cannot distinguish. Persisting
indefinitely is the honest option and is the one that holds at a crag.

### No global indicator in `StatusBar`

`src/lib/components/StatusBar/StatusBar.svelte` already has the hold-debounce pattern and would be
the obvious home, but a syncing state there would be on screen almost permanently on a slow
connection and would train readers to ignore the bar that also carries needs-auth and
reload-required. Per-surface affordances say which content is incomplete, which is the useful part.

### A relation-free notification query for the badge

`src/lib/entities/notification/` gains a bare-row variant, following exactly what
`listRoutesForMap` already did for the map. The existing query carries ten related trees including
the full route tree and block to topos to file, and the badge registers up to 100 rows of it to
render a number. The fat query stays for the inbox screen. Lowering the cap was considered and
rejected: it changes what "99+" means for no structural gain.

### The feed keeps its growing window

Cursor paging was considered and rejected by the user: the window is rarely grown and the growing
form was chosen deliberately because cursors are awkward here.

## Risks / Trade-offs

- **Relocation forces every client to re-sync once** → Same path the 48-hour inactive-record
  collection already produces for anyone who skips two days, handled by `onClientStateNotFound`.
  Deploy at low traffic and keep the old database for a day.
- **`maxRecentQueries` could regress the feed** → Shipped as its own measured step so it can be
  reverted alone.
- **Redefining `isEmpty` changes every empty state at once** → The blast radius is the point, but it
  must be proven rather than assumed: see the sweep and the verification sweep in tasks.md, and
  prove the new test red before trusting it.
- **A future call site uses the latched member for form seeding** → Naming plus a comment at the
  member, and the fingerprint guards keep reading the strict one. This is the failure that loses
  user data, so it is the one worth over-guarding.
- **The gate may show relocation did not help** → Then the deferred items have named triggers:
  per-area opt-in and taking the map off Zero, in that order.
- **The new Postgres container is not backed up** → Deliberate, since the records are derived. The
  risk is a future maintainer adding it to a backup job; mitigated by recording the reason in
  `deployment/README.md` beside the variable rather than leaving an unexplained absence.
- **`pingTimeoutMs` is undocumented** → It appears in the shipped type definitions but nowhere in
  Zero's docs, and no issue on Rocicorp's tracker discusses this behavior, so there is no upstream
  guidance and no prior art. Mitigated by it being typed on the class: if an upgrade removes or
  renames it, `z.pingTimeoutMs = n` fails to typecheck rather than silently doing nothing. Worth
  filing upstream, since nobody appears to have reported it.
- **Tightening the ping could still cause a false disconnect** → Only inside a window entered on
  positive evidence that the network works, and only until the connection is re-established. If it
  proves troublesome the value is one constant, and the fallback is Zero's default with no other
  change.
- **Rocicorp may move the client view records themselves** → Their tracker carries an open issue
  proposing exactly that, on the grounds it would "massively improve perf and lower cost", with a
  maintainer noting complexities. If that ships, our relocation becomes redundant, though not
  harmful. Not a reason to wait, but a reason to keep the relocation reversible.

## Migration Plan

Reordered once the four problems were separated. The original order optimized for C, which is the
mildest of the three latency problems and not the one a reader hits most.

1. **Resume latency (A).** Client-side only, no deploy coupling, targets the complaint that prompted
   this. Rollback is deleting one assignment.
2. **Registration removals**, already implemented, deployed before any baseline so the floor is
   clean.
3. **Why the map queries register on the feed (B).** Diagnostic before architectural. Answer it
   before deciding anything about the map.
4. **Baseline** captured on the feed, cold and after a warm back-navigation.
5. **`ZERO_CVR_DB` cutover (C)** at low traffic. Rollback is reverting one environment variable while
   the old database is still intact.
6. **`maxRecentQueries` (C)** as a separate deploy, measured against the previous numbers.

The loading-state work (D) is independent of all of these and can land in parallel on its own
branch. It does not address A, B or C, and A in particular cannot be covered by it.

## Open Questions

- The current value of `ZERO_NUM_SYNC_WORKERS`, which is held in Bitwarden. One client group is
  served by one worker, so if it is 1 on a two-core box then serialization is a property of the
  deployment rather than of Zero. This does not change the approach or the task breakdown, but it
  changes how the step 3 numbers should be read, so record it before the baseline.
