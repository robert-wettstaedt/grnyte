## Why

Zero query hydration takes 1 to 5 seconds on production, and the interface lies about it. Measured
on a prod block and route page: 42 queries, server execution 0.8 to 34.5ms, client ingest 0 to 21ms,
but `hydrateTotal` up to 3352ms, clustering in lockstep bands. The wait is queue time, not work.

The cause is that `ZERO_CVR_DB` is unset, so Zero's client view records default to the upstream
Supabase in Frankfurt while zero-cache runs in Nuremberg. Every query registration pays a
cross-datacenter round trip, serialized per client group, against a 131 MB table whose indexes
(66 MB) are larger than its heap (65 MB).

The latency predates v2 and is not new. What is new is that v2's loading states are less optimistic,
so the wait became visible. Those states are also simply wrong in places: a route page renders "You
are offline" to a reader who is merely waiting, roughly 26 surfaces derive counts and histograms
from lists that are still arriving, and nothing anywhere reads the `isSyncing` signal the resource
already exposes. Those two halves are independent, and the loading states must stay correct at a
crag on a slow connection however fast production becomes.

## What Changes

**Sync latency (infrastructure, no spec-level behavior change).** Sequenced, each step measured
before the next, because attribution is the whole point:

- Remove wasted query registrations first: debounce the search box (it registers four queries per
  keystroke), gate `usersByIds` and `blockTopos` with `enabled` when their id list is empty, and add
  a relation-free variant of the notification query that feeds the unread badge.
- Capture a baseline on the feed page (reported as the slowest), cold and after a warm
  back-navigation, plus the current `ZERO_NUM_SYNC_WORKERS` value.
- Point `ZERO_CVR_DB` at a Postgres container on the VPS beside zero-cache. `ZERO_CHANGE_DB` does
  not move. The new database is deliberately not backed up, and that is recorded rather than left
  as an absence.
- Set `maxRecentQueries` to 20, as its own measured step. It defaults to 0, which is why the CVR
  holds 1,509 active and 9,920 deleted desires with zero inactive.

**Loading states (behavioral).**

- Add a latched `settled` signal to `QueryResource`, keyed on the query hash, forward only, never
  cleared. The strict transport fact stays a separate member under a name that discourages
  accidental use, because four `known` fingerprint guards seed from it and a latched value there
  turns `updateRoute` into a delete.
- Redefine `isEmpty` as `settled && rawEmpty`. Every absence claim already routes through it, so
  they become correct at once.
- Give `QueryState` a `syncing` snippet with a default, filled per surface. Partial rows render with
  a persistent affordance and no timeout, since the client cannot tell slow from stalled.
- Sweep for every site matching the known wrong patterns, then fix the two that render an offline
  notice while merely loading.

## Capabilities

### New Capabilities

- `sync/query-readiness`: what the interface may state about data that is still arriving. How a
  query becomes settled and why that verdict is latched, how offline, slow-but-arriving and complete
  are told apart, which claims require a settled query and which may render early, and what a
  surface shows in each state.

### Modified Capabilities

None. `openspec/specs/` is still empty; `add-video-readiness` is the project's first spec and is
unrelated.

## Non-goals

- **Per-region or per-area offline opt-in.** The CVR came in at 5.25 MB per client group against the
  4.6 MB `src/lib/zero/offline.ts` anticipated, so the threshold that design set did not fire.
  Per-region specifically is rejected on its own terms: it breaks the `/explore` query hash dedupe
  so the CVR grows for anyone opening the home screen, it is unshippable without a per-region sync
  stamp, and the largest region holds 4,550 of 6,433 routes so the axis cannot reach the target.
- **Taking the explore map off Zero.** Deferred behind the measurement gate.
- **Cursor paging for the feed.** The growing window was chosen deliberately and is rarely grown.
- **A write-side optimistic primitive.** Zero has processed zero mutations ever, by design, so there
  is no acknowledgement to await and roughly 14 sites compensate in eight hand-rolled ways. That is
  a separate change after this one, and it must land as one primitive rather than a ninth pattern.
- **A global syncing indicator in `StatusBar`.** It would be on screen almost permanently at a crag
  and would train people to ignore the bar that also carries needs-auth and reload-required.
- **Bucket-D call sites.** Nine surfaces make wrong claims for reasons that only resemble this one,
  including `clearAppBadge()` wiping the iOS badge on every open. Separate pass.

## Impact

**Entity modules**: `src/lib/entities/notification/` (relation-free badge query plus its dto and
resource), and read-only sweeps across every module under `src/lib/entities/*/resources.svelte.ts`.

**Core**: `src/lib/zero/resource.svelte.ts` (the `settled` member, the renamed strict member,
`isEmpty`), `src/lib/components/QueryState/QueryState.svelte` and its `remoteResource.ts`, which
implements the same interface and must gain the new member.

**Routes**: `src/routes/(app)/routes/[id]/+page.svelte` and
`src/routes/(app)/routes/[id]/ascents/+page.svelte` (the two sites rendering an offline notice while
loading), plus the search surface that fires per keystroke.

**Tables**: none. No schema change, so the drizzle and zero generation pipeline is not involved.

**Deployment**: `docker-compose.yml`, `deployment/docker-compose.zero.yml`,
`deployment/README.md`, and a new `ZERO_CVR_DB` secret in Bitwarden with its mapping in
`.github/workflows/deploy-zero.yml`.

**Client-breaking**: no. No route is reshaped, no `.remote.ts` file moves, no remote function export
is renamed, and `manifest.id` is untouched, so already-loaded tabs keep working across the deploy.
One deliberate effect is worth stating anyway: pointing `ZERO_CVR_DB` at an empty database means
zero-cache finds no client view record for any existing client group, so **every client re-syncs
once**. That is the same path the 48-hour inactive-CVR collection already puts anyone through who
skips two days, and the client handles it through `onClientStateNotFound`. Ship it at low traffic
and leave the old database untouched for a day so rollback is reverting one environment variable.
