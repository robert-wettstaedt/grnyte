## Context

See proposal.md for motivation. The constraints that shape the approach, all established by
measurement rather than assumption:

- Query execution is fast and the wait is queue time. Server 0.8 to 34.5ms, client ingest 0 to 21ms,
  `hydrateTotal` up to 3352ms, clustering in lockstep bands.
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

### Ship as four separately measured steps

Registration removals, then baseline, then relocation, then `maxRecentQueries`. Bundling was the
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

## Migration Plan

1. Registration removals ship first, before any measurement, so the baseline has a clean floor.
2. Baseline captured on the feed page, cold and after a warm back-navigation.
3. `ZERO_CVR_DB` cutover at low traffic. Rollback is reverting one environment variable while the
   old database is still intact.
4. `maxRecentQueries` as a separate deploy, measured against step 3's numbers. Rollback is reverting
   one environment variable.

The loading-state work is independent of all four and can land in parallel on its own branch.

## Open Questions

- The current value of `ZERO_NUM_SYNC_WORKERS`, which is held in Bitwarden. One client group is
  served by one worker, so if it is 1 on a two-core box then serialization is a property of the
  deployment rather than of Zero. This does not change the approach or the task breakdown, but it
  changes how the step 3 numbers should be read, so record it before the baseline.
