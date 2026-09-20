## Why

Production feels slow, and the interface is not honest about it. Measurement found **four distinct
problems**, not one. An earlier draft of this proposal named a single cause (cross-region client
view records); that held only for one of the four, and is corrected here.

| # | Problem | Measured | Cause |
| --- | --- | --- | --- |
| A | Reader opens the app after a push and waits for one new row | up to **10 s** | Zero takes 2 x `pingTimeoutMs` to notice a socket that died while the app was away |
| B | Drawing the `/explore` map | **4607 ms**, `listBlocks({})` alone 2081 ms of server time | three unbounded queries hydrating, serialized across 2 sync workers |
| C | Warm back-navigation to the feed | **1279 ms**, 72% of it NOT server work | per-registration round trips to client view records in another datacenter |
| D | The interface states things it cannot know | n/a | no signal distinguishing "arriving" from "complete" |

**A is the one a reader hits most often and nothing in this app can detect it.** While Zero waits out
its idle-then-pong cycle it reports `connected`, so `isOnline()` is true, the status bar stays quiet
and every resource still reports complete, because it was complete for the data it has. The app
renders correct-looking stale content and has no evidence anything is wrong. D cannot fix A.

**B is the largest single cost, and it is on `/explore`, not the feed.** An earlier reading put it on
a cold feed at 3810 ms; that capture was reached by clicking and carried `/explore`'s queries with it.
A feed reached directly is **503 ms**. Drawing the map is 4607 ms, of which `listBlocks({})` alone is
2081 ms of server time. `ZERO_NUM_SYNC_WORKERS` is 2 on a 2-core box and one client group is served
by one worker, so that work serializes. It compounds with the deferred leak below: the cost is paid
once, but the queries then stay registered for the whole session.

**C is real but the mildest.** `ZERO_CVR_DB` is unset, so client view records live in the upstream
Supabase in Frankfurt while zero-cache runs in Nuremberg, and each registration pays a
cross-datacenter round trip against a 131 MB table whose indexes (66 MB) exceed its heap (65 MB).

The latency predates v2. What is new is that v2's loading states are less optimistic, so the wait
became visible. Those states are also wrong in places: a route page renders "You are offline" to a
reader who is merely waiting, roughly 26 surfaces derive counts from lists that are still arriving,
and nothing reads the `isSyncing` signal the resource already exposes. D is independent of A to C
and must stay correct at a crag on a slow connection however fast production becomes.

## What Changes

**Resume latency (A).** On returning to the foreground the app already learns within about a
millisecond, via its existing reachability probe, that the network works. When that succeeds while
Zero still reports `connected`, that pairing is positive evidence the socket is dead and Zero has
not noticed. Tighten `pingTimeoutMs` for that window only and restore Zero's default once
reconnected, so steady-state behavior on a weak connection is unchanged.

**Diagnostics for A, on the device.** Everything measured so far is desktop Chrome against the dev
stack, and A is the one problem no measurement can reach afterwards: while it happens the app
reports `connected`, so there is no error, no status bar, no state change, and nothing to look at
later. The app records, in `localStorage`, the resumes that turned out to need a reconnect, and
`/settings/errors` grows a section reading that back. Device-local, so nothing is transmitted.

**Sync latency (B and C, infrastructure, no spec-level behavior change).** Sequenced, each step
measured before the next, because attribution is the whole point:

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

**Cold-load volume (B), diagnostic only.** `listBlocks({})`, `listAreas({})` and
`listRoutesForMap({})` are registered on the FEED, not only on `/explore`, and nothing obvious
explains why a feed needs 12,600 rows of map data. Establish why before deciding anything. If it is
a surface staying mounted across the shell, scoping it is far smaller than moving the map off Zero
and may recover most of the 2938 ms.

**Loading states (D, behavioral).**

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
- **Rearchitecting the explore map.** Moving the map off Zero stays out of scope. What is now IN
  scope is only the diagnostic question above it: why those queries register on the feed at all.
  Whether anything architectural follows is a later decision, made on that answer.
- **Sending the resume diagnostics anywhere.** They stay on the device. Routing them into
  `client_error_logs` is the obvious next idea and is rejected on three counts. The viewer groups by
  error text and keeps the newest 100 groups, so unbucketed timings would each become their own
  group and push real error groups out of the window, degrading the tool used to find actual bugs.
  The admin alerter mails every unalerted row, so it would need its own exclusion. And it would be
  the first behavioral telemetry in an app that has no opt-out mechanism, which is a product
  decision and not an implementation detail. Revisit only if one device's data proves insufficient.
- **Releasing queries when a component goes.** Nothing de-registers a query within a page's life, so
  a session accumulates the union of every query it has run. Deferred rather than fixed: the same
  root cause was investigated under `memlab/`, the fix was measured with a full 2x2 and reverted
  (`9a0ba6f4`, `a68586b9`) because it costs about 6 MB per navigation. That trade was decided on
  memory alone, before anything was known about what an unreleased query costs in registrations and
  rows pinned. See design.md for the trigger to reopen it, and note it makes step 4 a no-op until it
  lands.
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

**Connection**: `src/lib/zero/z.svelte.ts` (`zeroOptions`, and the client instance whose
`pingTimeoutMs` is adjusted) and `src/lib/state/online.svelte.ts`, whose existing resume handler and
reachability probe already produce the signal this needs.

**Diagnostics**: a new device-local recorder beside the connection code, a "this device" section on
`src/routes/(app)/settings/errors/+page.svelte`, and its copy in BOTH `messages/en.json` and
`messages/de.json`. No table, no remote function, no migration: the data never leaves the browser.

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
