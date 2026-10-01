# Measurements

Working notes for this change. Tasks 2.2, 2.3, 3.5, 4.3, 4.4 and 6.1 all record here.

## 2.1 Deployment values, recorded before any change

| Value                   | Setting                                      | Source                         |
| ----------------------- | -------------------------------------------- | ------------------------------ |
| `ZERO_NUM_SYNC_WORKERS` | **2**                                        | user, 2026-09-20               |
| VPS cores               | 2 (arm64, Hetzner CAX11, 4 GB)               | `/statz?group=os`              |
| `maxRecentQueries`      | 0 (Zero default, never set)                  | `zero.js:229` + grep of `src/` |
| `ZERO_CVR_DB`           | unset, so the CVR lives in upstream Supabase | grep of repo                   |

Read the sync-worker count alongside the banding in 2.2: a client group is served by one worker, so
with two workers the serialization observed on a page is partly a property of this deployment rather
than of Zero. It is the reason step 3's numbers must not be read as "Zero got faster" on their own.

## Reference point already captured (pre-change, prod, block+route page)

Not the feed, so not the baseline for the gate. Kept because it is the reading that identified the
cause, and because it is the only pre-change prod capture that exists.

- 42 queries registered on one page.
- `hydrateServer` 0.8 to 34.5 ms, `hydrateClient` 0 to 21 ms, `hydrateTotal` up to **3352 ms**.
- Totals cluster in lockstep bands: 15 queries at 722 to 749 ms, 6 at 3332 to 3352 ms.
- CVR at the time: `rows` 131 MB (65 MB heap + 66 MB indexes), 389,805 live tuples, 59,364 dead
  (13%, autovacuum same day), **5.25 MB per client group**, ~352 B per row.
- 84% of row-refs from four unbounded queries: `listRoutes({})` 213,176, `listBlocks({})` 98,708,
  `listRoutesForMap({})` 71,307, `listAreas({})` 12,240.

## 2.0b CORRECTED pre-step-0 reading (prod, 2026-09-20)

Supersedes the cold half of 2.0 below. Same account, still pre-step-0 (`blockTopos({blockId:[]})`
and the fat `listNotifications({limit:100})` are both still present, which is the tell). The only
difference in method: `/feed` was typed into a fresh tab rather than reached by clicking, so no
earlier `/explore` visit could leak into it.

| Reading                           | Queries | Slowest `hydrateTotal` |
| --------------------------------- | ------- | ---------------------- |
| 2.0 "cold", reached by clicking   | 16      | **3810 ms**            |
| 2.0b cold, typed into a fresh tab | 12      | **503 ms**             |

**The feed was never slow.** 3810 ms was four leaked map queries riding along from a previous
`/explore` visit in the same tab. A genuinely cold feed is 503 ms, with ~321 ms of server work spread
across twelve queries, the largest being `listEvents({limit:50})` at 145 ms.

Warm, after clicking to Explore and back, 16 queries, slowest **4607 ms**. Every query from the cold
set kept its cold total exactly (503, 503, 502 and so on), so none of them re-hydrated. The entire
warm cost is the four map queries hydrating for the first time:

| Query                        | server ms      | total ms |
| ---------------------------- | -------------- | -------- |
| `listBlocks({})`             | **2081**       | 4602     |
| `listAreas({})`              | 360            | 4599     |
| `listRoutesForMap({})`       | 358            | 4607     |
| `listFirstAscensionists({})` | 13             | 4534     |
|                              | **2812 total** |          |

### What this relocates

- **Problem B is an `/explore` problem, not a feed problem.** Drawing the map costs ~4.6 s, of which
  `listBlocks({})` alone is 2081 ms of server time. The feed is fine. The cold-load work in this
  change was scoped against a slow feed that does not exist.
- **It compounds with the leak.** Paying 4.6 s once would be one thing; those four queries then stay
  registered for the rest of the session, which is what made the earlier "cold" feed look slow.
- The line below claiming the map queries "are registered on the FEED" is wrong and is kept only so
  the correction is legible. Group 10 established they are registered on `/explore` and never released.

Unexplained, and it decides whether those queries really pin ~6k rows per client group: all four
report `rows: 0` here, against 6,642 / 5,966 / 753 / 293 in the earlier reading. Most likely
`hydrateTotal` is stamped when the server finishes while `rowCount` reflects what the client holds at
sample time, so the rows were still arriving. Testable by re-sampling the same tab a minute later.

## 2.0 PRE-step-0 feed reading (prod, 2026-09-20), COLD HALF SUPERSEDED BY 2.0b

Its cold capture was reached by clicking rather than typed, so it carried `/explore`'s leaked queries
and read 3810 ms for a feed that is actually 503 ms. Kept because the warm half and the CVR figures
still stand, and because the mistake is instructive: a "cold" reading is only cold if the tab has
been nowhere else.

Not the gate's baseline: step 0 was not deployed. Two of its targets are visible in the table and
confirm that, `blockTopos [{"blockId":[]}]` and the fat `listNotifications [{limit:100}]`.
Desktop, so no guidebook preload: `listRoutes({})` is absent.

**Cold** (fresh tab on `/feed`): 16 queries, slowest `hydrateTotal` **3810 ms**.

| Query                            | rows  | server ms  | total ms |
| -------------------------------- | ----- | ---------- | -------- |
| `listBlocks({})`                 | 5,966 | **2104.8** | 3714     |
| `listRoutesForMap({})`           | 6,642 | 422.3      | 3722     |
| `listAreas({})`                  | 753   | 411.3      | 3719     |
| `listEvents({limit:50})`         | 226   | 145.6      | 516      |
| `listEvents({limit:50,upTo})`    | 226   | 134.2      | 2963     |
| `blockTopos({blockId:[]})`       | 0     | 1.0        | 3059     |
| `listNotifications({limit:100})` | 0     | 14.3       | 1077     |
| (9 others)                       |       | < 13 each  |          |

Server hydration sums to **~3265 ms of the 3810 ms slowest total, i.e. 86%**. Three unbounded
queries are **90% of that server work**, and `listBlocks({})` alone is 2.1 s for 5,966 rows.

**Warm** (in-app nav to Explore and back, no reload): 16 queries, slowest **1279 ms**.

The four heavy queries report `total: 0`, i.e. they did not re-hydrate; their `hydrateServer` values
are read as the earlier reading's metric rather than new work. Of the twelve that did hydrate,
server time sums to **~356 ms against a 1279 ms slowest total**, so **~920 ms (72%) is not server
work**.

### What this says, and what it overturns

- **The earlier "server execution is fast, the wait is queue time" conclusion does not hold cold.**
  It came from a block+route page whose queries are small. On a cold feed the server work IS the
  cost. That reading was right about its own page and wrong as a generalisation.
- **`ZERO_NUM_SYNC_WORKERS=2` makes this worse than it looks.** A client group is served by one
  worker, so those server hydrations serialize. 3265 ms of serialized work against a 3810 ms slowest
  total is close enough to be the explanation.
- **Cold and warm are different problems.** Cold is dominated by hydrating unbounded queries. Warm
  has almost no server work and still takes 1.3 s, which is the registration and round-trip overhead
  that CVR relocation and `maxRecentQueries` target.
- **The deferred map item (Q13) now has its trigger.** `listBlocks({})` and `listRoutesForMap({})`
  are registered on the FEED, not just `/explore`, and are the single largest cold cost. Why they
  are registered there at all is an open question worth answering before acting.

## 9.3 What was and was not verified

Verified live on the dev app, driven, signed in, on `/feed`:

- Steady state reports Zero's default `pingTimeoutMs` of 5000, so detection is 10 s (task 9.4).
- A resume whose probe succeeds while Zero reports `connected` drops it to **2000**, so detection
  becomes ~4 s. Sampled every 250 ms across the transition.
- It restores to the captured previous value after the window, observed at ~23 s on a clock that
  started ~7 s after the handler fired, which reconciles with the 30 s window.

### Recovery measured end to end

A silently dead socket was reproduced without touching the network, by wrapping `WebSocket` in the
page and dropping Zero's outbound `["ping",{}]` frames. The socket stays open, Zero keeps reporting
`connected`, and the pong never arrives, which is the condition exactly. No privileges, no packet
filter, and it needs no simulator: the iOS Simulator shares the host network stack, `pfctl` skips
loopback, and WebKit is not the variable here.

Both runs on `/feed`, timings read off the wire rather than from any app state:

| Phase                                                     | Default 5000 | Tightened 2000 |
| --------------------------------------------------------- | ------------ | -------------- |
| swallowed ping to socket CLOSE (the pong deadline)        | **5.0 s**    | **2.0 s**      |
| CLOSE to reconnected (`RUN_LOOP_INTERVAL_MS` backoff)     | **5.0 s**    | **5.0 s**      |
| from the ping that timed out to connected                 | **10.1 s**   | **7.0 s**      |
| worst case from the socket dying, including the idle wait | **~15 s**    | **~9 s**       |

So the change is worth about 40%, not the 2.5x an earlier note claimed. The reason is the 5 s
reconnect backoff, which `pingTimeoutMs` does not touch: `PingTimeout` maps to `NO_STATUS_TRANSITION`
in `error.js`, and that branch sleeps `backoffMs`, which is the module constant
`RUN_LOOP_INTERVAL_MS`. It is not an option, so 5 s is a floor this approach cannot go under.

Caveat on scope: measured in Chrome against the dev stack, so it pins Zero's client-side timers,
which are the same everywhere, and not a real phone's radio behavior.

Two harness facts worth keeping:

- `select_page` does not change `document.visibilityState`, so no `visibilitychange`, `pageshow` or
  `focus` fires and a real tab switch is not reproducible. The resume was triggered by dispatching
  `focus`. The listener chain that runs is the real one; only the event's origin is synthetic.
- Reading `window.__zero` in dev is unreliable: an HMR-surviving client made a first attempt report
  `connected` throughout while a live socket was being cut, because the state came from a stale
  instance. Tag sockets and read the wire instead. Same trap as the `?t=` HMR note in memory.

## 10.1 and 10.2 The premise was wrong, and what is actually happening is bigger

Task 10 assumed the map's unbounded queries are registered ON the feed. They are not. Measured in
dev, signed in, using real in-app navigation:

| Step            | Queries | Unbounded map queries                  |
| --------------- | ------- | -------------------------------------- |
| fresh `/feed`   | 11      | **none**                               |
| `/explore`      | 15      | all four (correct, the map draws them) |
| back on `/feed` | 15      | **all four still there**               |

They register on `/explore` and never leave. Held for at least a minute on the feed, so not a
deferred cleanup that eventually fires. The `(map)` layout HAS unmounted by then: zero `.ol-viewport`,
zero `canvas`, no search bar. The DOM is gone and the queries are not.

**It is not specific to the map.** Walking feed to profile to feed to explore to feed to profile, the
count went 15, 23, 23, 23, 23, 23: it grows to the union of everything the session has visited and
never shrinks. Revisiting adds nothing because those queries were never released.

**Mechanism.** `createResource` builds a zero-svelte `Query` inside a `$derived` and calls
`view.ensureSubscribed()` on it. `ensureSubscribed` is just `#subscribe()`, and nothing is paired to
it: `Query.destroy()` exists in zero-svelte and is never called from `src/lib/zero/resource.svelte.ts`
on a resource's query. The only `.destroy()` calls in that directory are on the throwaway views in
`waitForRow` and the dev bench. When the component unmounts, Svelte disposes the derived signal; the
`Query` it produced keeps its subscription. Changing a resource's arguments has the same shape: the
derived produces a new Query and abandons the old one, still subscribed.

### Why this matters more than task 10 did

- It explains the 42 queries on one prod page. That is a browsing session's union, not one page.
- **It makes step 4 pointless as written.** `maxRecentQueries` governs eviction of queries that have
  been de-registered, and nothing is ever de-registered within a page's life. Setting it to 20 would
  change nothing. That is a design issue in the plan, not an implementation detail.
- It is a candidate root cause for the rows pinned per client group (p50 20,391), which is B and C's
  driver. A client group holds the union of every query every tab in it has ever run.
- The CVR's 9,920 deleted against 1,509 active fits: de-registration happens on page close, not on
  navigation.

Not done: **10.3**, whose precondition is "only if 10.2 says scoping". It does not. Scoping the feed
would fix nothing, because the feed never registered them.

## 11.6 Removal trip-wire

The resume log is temporary instrumentation for the gate in 4.4. Once that is decided, delete:

- `src/lib/logging/resumeLog.ts` and `src/lib/logging/resumeLog.test.ts`
- the `resumes` state, `clearResumes`, the `$lib/logging/resumeLog` import and the
  `settings_resumeLog*` section in `src/routes/(app)/settings/errors/+page.svelte`
- the five `settings_resumeLog*` keys from BOTH `messages/en.json` and `messages/de.json`
- `openResume`, `noteConnectionForResume` and the `recordResume` import in `src/lib/zero/z.svelte.ts`,
  leaving `tightenPing` in place, which is the fix rather than the measurement

Keys written by shipped builds outlive the code, so clearing `<app>.resumeLog` from a device is the
reader's business and not worth a migration.

Verified on the dev app 2026-09-20: a healthy resume records nothing; a resume onto a socket killed
by swallowing its pings recorded exactly one entry at **8879 ms**, which matches the predicted ~9 s
(2 s idle, 2 s pong deadline, 5 s reconnect backoff). The section reads correctly in German at both
375x667 and 1280x800 with no horizontal overflow, the empty state renders real copy rather than a
blank panel, and the clear button is absent when there is nothing to clear.

## 2.2 and 2.3 NOT THE BASELINE: captured on the PREVIEW origin (2026-09-20)

Recorded first as "prod, post-step-0". That was wrong. `grnyte.rocks` still runs pre-step-0, so a
capture showing `blockTopos({blockId:[]})` gone and `countUnreadNotifications` present can only be
the preview deployment on its own Vercel domain.

Why it cannot serve as the gate's before-reading:

- **Different origin, so a different IndexedDB replica and a different client group.** Cold means
  something different there than on prod.
- **`countUnreadNotifications` never transforms there** (`server: null, total: null`), because
  zero-cache resolves named queries against the PRODUCTION app. So the capture is not "step 0
  applied", it is "step 0 applied, minus the badge change, plus a query that fails".
- Step 3 will be measured on whichever origin it is measured on, and a before and after have to come
  from the same one.

Kept because the per-query `hydrateServer` numbers in it are real and consistent with the others, and
because the mislabelling is the kind of error that is only visible once written down.

**Cold** (typed into a fresh tab): 11 queries, slowest `hydrateTotal` **882 ms**, server work
**~284 ms**.

**Warm** (clicked to Explore and back): 15 queries, slowest still **882 ms**. The four map queries
appear with `total: 0` and full row counts (5,966 / 753 / 6,642 / 293), so they did NOT hydrate: the
data was already in this origin's replica. They added four registrations and no time.

### Step 0's effect is not measurable in this pair, and that is the finding

|                        | Queries | Slowest total | Server work |
| ---------------------- | ------- | ------------- | ----------- |
| pre-step-0 cold (2.0b) | 12      | **503 ms**    | ~321 ms     |
| post-step-0 cold (2.2) | 11      | **882 ms**    | ~284 ms     |

Step 0 did what it was meant to: one fewer registration, ~37 ms less server work. But wall clock moved
379 ms the WRONG way on nominally identical captures. Since server work fell, that difference is all
in the non-server component, which is run-to-run variance on production.

**Single samples of `hydrateTotal` cannot resolve an effect this size**, and the fix is to stop
measuring `hydrateTotal`. Across the same captures:

| Metric                          | Readings                  | Spread   |
| ------------------------------- | ------------------------- | -------- |
| slowest cold `hydrateTotal`     | 503, 882 ms               | **~75%** |
| `listEvents({limit:50})` server | 145.5, 132.7 ms           | ~9%      |
| `listBlocks({})` server         | 2104.8, 2081.3, 1868.6 ms | ~12%     |

The noise lives in the client's network path, which `hydrateServer` excludes, and `hydrateServer` is
also the half that relocating the client view records should move. Tasks 3.5 and 4.3 now read median
`hydrateServer` per query over three captures. `listBlocks({})` at ~2000 ms is the number to watch.

Do not try to A/B this against a preview deployment. One zero-cache means prod-CVR and VPS-CVR cannot
run at once, and a preview origin cannot exercise a new named query at all: `ZERO_GET_QUERIES_URL`
points zero-cache at ONE environment's app, so a preview client is transformed by the production app.
Observed on a preview: `countUnreadNotifications` reported `server: null, total: null` while a
legitimately empty query in the same capture reported real metrics, which also means the notification
badge reads zero there whatever the true count.

### What the warm capture settles

The `rows: 0` anomaly from 2.0b is explained, and the two readings together give the rule. A query
that is actively hydrating shows a `hydrateTotal` and no rows yet; one whose data is already local
shows `total: 0` and full rows. So:

**The 4607 ms map cost is a COLD-REPLICA cost, not a per-visit one.** Once those rows are in the
origin's replica, visiting `/explore` is free. What persists is the ~13,654 rows pinned per client
group, which is C's problem rather than a latency one.

## 2.2 and 2.3 THE BASELINE (12 captures, 2026-09-20)

Three cold and three warm on each of prod (pre-step-0) and the preview origin (post-step-0). Medians
of `hydrateServer` in ms.

### The gate number

`listBlocks({})` server time, six samples across both deployments:

```text
1926, 1973, 2078, 2079, 2106, 2473     median 2078.8
pre-step-0 median 2079.1  |  post-step-0 median 2078.4
```

**Step 3 has to move this.** It is stable to within ~4.5% across five of six samples (the 2473 is the
lone outlier), it is identical across the two deployments, and step 0 does not touch it, which is
exactly what a control should look like. An effect below roughly 10% will not be distinguishable;
the hypothesis behind step 3 predicts far more than that, so a null result would be informative.

### Step 0's effect, which `hydrateServer` CAN resolve

|                           | pre-step-0                    | post-step-0                             |
| ------------------------- | ----------------------------- | --------------------------------------- |
| queries on a cold feed    | 12                            | **11**                                  |
| notification query server | 10.8 ms (`listNotifications`) | **2.3 ms** (`countUnreadNotifications`) |

A 79% drop on that query, cleanly resolved from three samples each. Small in absolute terms, about
8.5 ms, but it is a real effect measured through the noise, which is the point: the metric works.

### And `hydrateTotal` still does not

|                           | median | range           |
| ------------------------- | ------ | --------------- |
| cold slowest, pre-step-0  | 447 ms | 437 to 545      |
| cold slowest, post-step-0 | 831 ms | 610 to **1297** |

The post-step-0 range alone spans 2.1x, and the medians move 86% in the WRONG direction for a change
that provably removed work. Two different origins are part of that, but it is the same conclusion
either way: do not judge anything by this number.

### Which reading is the before for step 3

Either, because `listBlocks({})` is 2079 on both. Hold the ORIGIN constant: measure step 3's after on
the same deployment its before came from. Prod plus the pre-step-0 set is the cleaner pair, since it
also holds step 0 constant-and-absent, so the only thing changing is the client view records.

Other stable server medians worth comparing after the cutover: `listAreas({})` ~366 to 392 ms,
`listRoutesForMap({})` ~277 to 329 ms, `listEvents({limit:50})` ~142 to 154 ms.

## 3.2 zero-cache bootstraps an empty CVR database, verified locally

The cutover's one real unknown, and the reason it mattered: demo is being torn down, so there is no
rehearsal environment and prod would otherwise have been the first exercise.

Run locally against the dev upstream with `ZERO_APP_ID=cvrprobe`, which gives the probe its own
replication slot, publications and schemas so it cannot collide with the running dev zero-cache.
`ZERO_CVR_DB` pointed at an empty `postgres:17-alpine` with `POSTGRES_HOST_AUTH_METHOD=trust`,
matching the prod shape.

Result: **no manual step is needed.** zero-cache created `cvrprobe_0/cvr` in the empty database with
all seven tables (`clients`, `desires`, `instances`, `queries`, `rows`, `rowsVersion`,
`versionHistory`), reported `zero-cache ready (6350 ms)`, began serving and began replicating.

Also confirmed by the same run: trust auth over a container-to-container connection works, and the
CVR genuinely lands in the separate database rather than upstream.

Two things the probe needed that are easy to miss: `ZERO_ADMIN_PASSWORD` is required or it exits
with `missing --admin-password: required in production mode` before touching any database, and
`ZERO_AUTH_SECRET` now warns as deprecated.

Cleanup done and verified: the probe's slot `cvrprobe_0_a`, publications `_cvrprobe_public_0` and
`_cvrprobe_metadata_0`, and schemas `cvrprobe`, `cvrprobe_0`, `cvrprobe_0/cdc` were all dropped, and
the dev upstream matches its pre-probe baseline (slots `cainophile_alv3nj5e` and `zero_0_b`, schemas
`zero`, `zero_0`, `zero_0/cdc`, `zero_0/cvr`). A leaked replication slot retains WAL, so that check
is not optional.

## How to capture 2.2 and 2.3

On a production tab, signed in, on `/feed`:

Wrapped in an IIFE so it can be re-run in the same console session. A bare `const` throws
"already declared" on the second run, which is exactly when you need it (cold, then warm).

```js
await (async () => {
  const qs = await __zero.inspector.client.queries()
  const rows = qs
    .map((q) => ({
      name: q.name,
      args: JSON.stringify(q.args),
      rows: q.rowCount,
      client: q.hydrateClient,
      server: q.hydrateServer,
      total: q.hydrateTotal,
    }))
    .sort((a, b) => (b.total ?? 0) - (a.total ?? 0))
  console.table(rows)
  const t = rows.map((r) => r.total).filter((x) => x != null)
  const serverSum = rows.reduce((s, r) => s + (r.server ?? 0), 0)
  copy(JSON.stringify({ queries: rows.length, maxTotal: Math.max(...t), serverSum, rows }, null, 2))
  return 'copied'
})()
```

Cold means a first load of `/feed`. Warm means navigating away and back to it, which is the only
reading in which `maxRecentQueries` can show up at all. Both from the same account, so step 3 and
step 4 have a comparable pair. Record the query count, the distinct `hydrateTotal` bands, and the
time from navigation to the last query reporting `got`.

## 3.5 The cutover did not move the gate

Three cold and three warm captures on prod after the CVR relocation, medians of `hydrateServer`:

| query                    | after     | before | delta     | before-range |
| ------------------------ | --------- | ------ | --------- | ------------ |
| `listBlocks({})`         | 2174.8 ms | 2078.8 | **+4.6%** | 1926-2473    |
| `listAreas({})`          | 409.2     | ~379   | +8.0%     | 366-392      |
| `listRoutesForMap({})`   | 293.6     | ~303   | -3.1%     | 277-329      |
| `listEvents({limit:50})` | 143.2     | ~148   | -3.3%     | 142-154      |

Null result, and a pre-registered one: the gate was declared unresolvable below ~10% and the
hypothesis predicted far more. **Cross-region client view record bookkeeping was not a measurable
part of this app's sync latency.** Do not reinstate that reasoning.

### What the numbers point at instead

`listBlocks` costs 0.353 ms/row; `listRoutesForMap` costs 0.044 ms/row on MORE rows (6729 vs 6158).
An 8x per-row gap, so this is query shape and not volume: `listBlocks` carries `topos` (with nested
`file`), `area` (with nested `parent`) and `geolocation`, while `listRoutesForMap` is the
relation-free twin of `listRoutes` and carries none. A `listBlocksForMap` holding only what markers
render is the next lever. Note this is NOT the rejected "reduce rows pinned" option in design.md;
none of that option's objections (the `/explore` hash dedupe, the per-region sync stamp) apply to
dropping relations the map never draws.

### Why the change was kept anyway

A different benefit, measured after the fact in the upstream database. `zero_0/cvr` was **184 MB of
a 298 MB database, 62%**, against 114 MB of real application data, with 3.2M row writes across its
tables. Supabase is on a capped plan, so that is the justification now; the README says so. The
frozen schema still occupies that space until it is dropped, so the move alone reclaimed nothing.

Sanity check on the cost model: ~88 MB heap over ~208k live rows is ~444 B/row, against the
~352 B/row in `offline.ts`. Same order, so that model holds.

## The feed symptom, reproduced: the pill queues behind the offline preload

The reported symptom is NOT the list staying put under a scrolled reader; that is `feed.svelte.ts`
working as designed. It is the time before the "N new activity" pill appears at all. The pill reads
`newCount = incoming.data.length`, and `incoming` is `listEvents({after: seen, limit: 50})`: zero
rows, ~3 ms of server work.

### Two hypotheses refuted on the way

- **Serialisation behind the first window.** `seen` is not persisted and is set from the first
  window, so the pill cannot register until `events` has rows. But with a warm local store those rows
  are local at mount: `window` minus `pill` total was 67, 67, 67 ms in three runs, and all three
  `listEvents` queries finish together. Costs ~67 ms, not a round trip.
- **Query TTL as the thing that makes the server cold.** Preloads do default to `ttl: 0`
  (`preloadImpl`), but a disconnect never inactivates desired queries
  (`#deleteClientDueToDisconnect`), and the TTL clock only advances while a client is connected. What
  actually drops server state is `DEFAULT_KEEPALIVE_MS` = 5 s: after the last client of a group leaves,
  the view-syncer shuts down and destroys every pipeline, so the next open re-hydrates every desired
  query. Consequence: on a phone, ANY absence over 5 s re-hydrates the whole offline guidebook.

### Desktop A/B, head-of-line blocking

Pill `hydrateTotal`, pooled with the 3.5 captures (same design):

- isolated (`/feed` typed, no Explore): 289, 353, 391, 525, 669, 1230, median ~458 ms
- contended (Explore first): 2855, 3633, 3928, 4963, median ~3781 ms

Ranges do not overlap, and in every valid run the pill landed at roughly the other queries' summed
server time plus a few hundred ms. Two runs read `total: 0` because another tab kept the view-syncer
alive; discarded.

### The phone path: field-device override, five runs

Desktop was only ever isolated because a browser tab is not a field device. An installed PWA is
(`shouldKeepOffline`: `installed` is true), so `preloadForOffline` registers `listRoutes({})`,
`listAreas({})` and `listBlocks({})` on every open, and `start_url` is `/explore` besides. Forced with
the `offlineData` override, `/feed` typed directly, fresh client groups:

| run | pillTotal    | pill server | others' server |
| --- | ------------ | ----------- | -------------- |
| 1   | 15,097 ms    | 3.4 ms      | 12,328         |
| 2   | **1,045 ms** | 4.3 ms      | 11,967         |
| 3   | 15,100 ms    | 3.0 ms      | 12,522         |
| 4   | 14,915 ms    | 3.1 ms      | 11,995         |
| 5   | **1,192 ms** | 4.0 ms      | 11,805         |

Three of five wait ~15 s. Two of five escape to ~1 s with the same ~12 s of other work registered,
which is the decisive observation: the pill is not slow, it is queued, and whether the feed or the
preload reaches the view-syncer first is a race. That ordering mechanism is inferred from timings, not
read in zero-cache's source.

### What the queue is made of

| query            | rows   | server   |
| ---------------- | ------ | -------- |
| `listRoutes({})` | 19,860 | 9,352 ms |
| `listBlocks({})` | 6,158  | 1,758 ms |
| `listAreas({})`  | 760    | 375 ms   |
| the other twelve |        | ~330 ms  |

`listRoutes({})` is 81% of it, at 0.47 ms/row against `listRoutesForMap`'s 0.044 ms/row over the same
routes: the relations are the cost, as with `listBlocks`. But `listRoutes({})` IS the offline
guidebook and its relations are what render a route page with no signal, so slimming it is a product
decision about offline scope, not a latency fix to make in passing.

Also observed: `inspector.clientGroup.queries()` returned 37 to 46 against 15 for the current client.
Not yet a finding: hydration is per hash, and those may be the same queries desired by earlier clients.

## 12.1 and 12.2, verified locally before the prod gate

Local reproduction of the phone path: Chrome, the `offlineData` override, an event inserted while
the app is away, every tab closed past the 5 s keepalive, `/feed` reopened with an `initScript`
observer. Measured is the first moment the new activity is visible at all (in the list or behind
the pill), against the `guidebook` stamp. Locally the new row lands in the list rather than behind
the pill, because on localhost the first window arrives before stale local rows are acknowledged.

| arm    | visible  | reference stamp | guidebook stamp | order                       |
| ------ | -------- | --------------- | --------------- | --------------------------- |
| before | 2,409 ms |                 | 2,407 ms        | after guidebook, +2 ms      |
| before | 2,205 ms |                 | 2,203 ms        | after guidebook, +2 ms      |
| before | 2,234 ms |                 | 2,232 ms        | after guidebook, +2 ms      |
| after  | 2,109 ms | 2,107 ms        | 3,434 ms        | before guidebook, -1,325 ms |
| after  | 1,944 ms | 1,941 ms        | 3,211 ms        | before guidebook, -1,267 ms |
| after  | 2,002 ms | 2,000 ms        | 3,261 ms        | before guidebook, -1,259 ms |

Before, the feed is released by the same event as the guidebook in 3 of 3; after, it is released
with the reference batch and the guidebook completes ~1.3 s later, in 3 of 3. The guidebook now
finishing well after the reference stamp is the control that the page ran the new code.
`listRoutes({})` hydrated fresh every run (604, 598, 598, 624, 576 ms), so each open was cold.

The absolute gain is small here and that is expected: local `listRoutes({})` is 7,838 rows and
~600 ms against prod's 19,860 and 9,352 ms, so locally the guidebook barely exceeds a ~1.7 s first
connection cost the feed pays either way. Unexplained, and NOT the guidebook: modules finish loading
at ~214 ms, and only this client desires the guidebook (39 desires, 21 distinct hashes, the two
earlier clients 11 each and none of them guidebook queries). Prod's escaped runs landed at ~1 s, so
the 12.3 gate is where the magnitude is decided.

12.2: offline, a route this client had never opened rendered from the local store with its name,
grade and full area and block chain. Ascents showed the offline notice, which is correct: they are
excluded from offline by design.

New coupling introduced: the guidebook preload now waits on the reference batch's `complete`, which
stays pending rather than rejecting. If a reference query never completes online, the guidebook never
syncs. The shell cannot render without those queries anyway, but the two were independent before.

## 12.3 The gate passed on prod: 5 of 5 under 2 s

Deployed in `83e38ece`. Same protocol as the before runs: field-device override, `/feed` typed
directly, a fresh profile per run, every tab of it closed past the 5 s keepalive.

|        | run 1  | run 2 | run 3  | run 4  | run 5 | median        |
| ------ | ------ | ----- | ------ | ------ | ----- | ------------- |
| before | 15,097 | 1,045 | 15,100 | 14,915 | 1,192 | **14,915 ms** |
| after  | 1,106  | 1,350 | 1,075  | 962    | 1,043 | **1,075 ms**  |

The guidebook still hydrated in full every run, cold each time: `listRoutes({})` server 9,430,
9,585, 9,517, 9,255 and 9,526 ms. Nothing was skipped to get the number; the pill no longer waits
for it. The race that let two of five before-runs escape is gone.

`listRoutes({})` read 0 rows in all five against 19,860 before. Read as timing, not loss: these
captures were taken as the pill appeared at ~1 s, while those rows were still streaming, whereas
before the fix a capture could only happen after the guidebook had landed. Not yet confirmed on prod;
the check is a re-run ~30 s later showing ~19,860 rows and a fresh `guidebookSyncedAt` stamp.

### A sixth run, outside the gate's five, did NOT meet 2 s: 3,929 ms

Not the old failure mode. The pill landed 8.2 s before this run's own guidebook server time, went
out with the reference batch as designed (every first-batch query finished at ~3.9 to 4.1 s), and no
guidebook rows had arrived (`listBlocks` and `listAreas` read 0 too), so the guidebook was registered
after it. What was slow is the first batch as a whole: ~0.5 s of server work, ~4 s of wall time.

Hypothesis, unverified: contention ACROSS client groups. Two sync workers, one per client group, so
another group's ~12 s guidebook hydration (another user, or the previous profile's group still
finishing after its tab closed) can hold the worker this group needs. Falsifier: the spacing between
closing the previous profile and opening this one, against runs 1 to 5. If it holds, deferral fixed
waiting behind one's OWN guidebook, and what remains is everyone waiting behind everyone's, which
only a cheaper guidebook or more sync capacity addresses.

### Run 6 against zero-cache's log: the transform is ruled out, two other costs found

Spacing refuted cross-client contention first: runs 1 to 5 were ~10 s apart, run 6 came after a
10 minute idle, and it was run 6 that was slow. The next suspect, a Vercel cold start of the
get-queries transform, is refuted twice: Vercel logged that request at 36 ms execution and 54 ms
end to end, and zero-cache re-transformed all 15 queries inside a ~75 ms window.

zero-cache's own timeline for the client group (`docker logs -t`, UTC):

| time   | step                     | cost                                |
| ------ | ------------------------ | ----------------------------------- |
| 43.610 | load CVR                 | 30 ms                               |
| 44.413 | load 23,040 row records  | 647 ms                              |
| 44.527 | re-transform 15 queries  | ~75 ms                              |
| 44.571 | `listEvents` upTo window | 227 ms, flagged "Slow SQLite query" |
| 44.839 | `listEvents({limit:50})` | 212 ms, flagged "Slow SQLite query" |
|        | the other nine           | 1 to 6 ms each                      |

Server side the first batch took ~1.46 s of the client's 3,929 ms. Two findings:

- A cold view-syncer loads every row record the client group holds before running anything:
  23,040, roughly the guidebook. Deferral does not avoid this, because the CVR remembers the rows from
  earlier sessions. A slimmer guidebook would shrink it.
- The feed's own window query is slow in SQLite, ~225 ms each time:
  `region_fk IN (SELECT value FROM json_each(?)) ORDER BY created_at desc, id desc` across 8
  regions. Possibly a multi-value IN defeating the composite index; unverified until the replica's
  query plan is read.

~2.4 s falls outside zero-cache's processing, before the connection or after the poke. The A/B
(profile A after a 10 minute idle, profile B 10 s later) is what separates those.

### A/B after a 10 minute idle: idle time is not the variable, the deferral's churn is

Profile A, opened after a 10 minute idle: pill 1,115 ms. Profile B, opened 10 s later: 3,597 ms,
but B's capture came after a reconnect (a Zero `Server ping request failed` the reader saw on
pasting), so B's own open was never measured by the snippet. zero-cache's log for both:

|                                                | A                                          | B                                    |
| ---------------------------------------------- | ------------------------------------------ | ------------------------------------ |
| opening set                                    | `6 to remove, 11 to add`                   | `6 to remove, 13 to add`             |
| 22,912 row CVR flush (the removal)             | 53.923 to 55.454, AFTER the batch finished | 24.088 to 25.471, BEFORE it finished |
| first batch `finished processing queries`      | wall 887 ms                                | wall 2,342 ms                        |
| re-add (`0 to remove, 6 to add`), second flush | 22,911 rows, 1.7 s                         | 22,911 rows, 1.7 s                   |

The six removed and re-added are exactly the six queries the deferral holds back. The CVR remembers
them from the last session, the opening set no longer has them, preloads default to `ttl: 0`, so
they are removed and ~1 s later added back: two ~1.6 s rewrites of ~23k row records per open, and
when the first lands before the batch finishes (B) it delays the pill. Inferred, not observed against
a pre-fix log, but the counts match the deferred set exactly.

Candidate, untested: give the guidebook preloads a TTL (`ttl: '10m'`, the clamp). An inactive query
is neither hydrated nor removed (`hydrateUnchangedQueries: 19 got queries, 2 inactivated, 17
hydrated`), so the six would be inactivated and reactivated instead of removed and re-added. The risk
that decides it: if an inactivated query were hydrated in the first batch, the guidebook would be back
in front of the feed. Verify by log: `hydrating 11 queries`, the six inactivated, and no
`flushing 22912 rows` before `finished processing queries`.

Correction to the disconnect finding: the `listRoutes({})` hydration is not one unbroken block. A's
ran 10,857 ms yet the row flush completed mid-stall at 55.454, so the loop got turns, and A did not
disconnect. B shows no turn for 10.2 s. It yields rarely, so the ping failure is chance, consistent
with the reader's ~50%. B's reconnect then re-hydrated 17 queries, guidebook included.

`hydrateTotal` starts at the server's "hydrating N queries", so the ~0.7 s of CVR row record loading
before it is not in `pillTotal`.

### TTL on the guidebook preloads, verified locally

Zero's docs: ordinary queries default to `5m`, `preload()` to `'none'` ("will stop syncing
immediately when deactivated"), `10m` is the maximum, and the clock only ticks while Zero runs. The
stated reason for `'none'`: a preload runs the whole time Zero runs, and a TTL on one whose args
change keeps the old variant running beside the new. The deferral breaks the first premise, which is
why `'none'` costs us; the second premise is why only the three arg-less guidebook queries get a TTL.

Measured on the local CVR (`zero_0/cvr.rows` rewritten past the pre-open `patchVersion`, field-device
override, one client group, every tab closed past the keepalive):

|                           | row records rewritten by one open                                      |
| ------------------------- | ---------------------------------------------------------------------- |
| `ttl: 'none'` (before)    | 10,167 of 10,361                                                       |
| guidebook at `ttl: '10m'` | 1,977: 1,965 `ascents`, 11 `region_members`/`users`, 1 `user_settings` |

The residue is exactly the keyed preloads left at `'none'` (`listUserAscents`, `listUsers`). The
guidebook tables churned zero rows. On prod those keyed preloads are ~650 rows against 22,912.

Not settled locally: whether a cached-but-inactive guidebook is hydrated in a cold view-syncer's
first batch, which would undo the deferral. The reference batch was no slower with the TTL (1,157 ms
against 1,279 ms the same session), which argues against it, but local `listRoutes` is too light to
be decisive. Decided on prod by the zero-cache log: no `flushing 22912 rows`, fewer than 6 to remove,
and no `listRoutes` hydration before `finished processing queries`.

### Local probe for "is the cached guidebook in the first batch": failed its controls

Idea: change route 103 (referenced by no first-batch query) and insert a feed event while the app is
away, then compare the two rows' `patchVersion` in `zero_0/cvr.rows`. Same version would mean the same
poke, i.e. the guidebook in the first batch.

- Two transactions: different versions in every arm. It measured commit order, not delivery.
- One transaction: the SAME version (`72qcizw0w`, `72qcn6shc`, `72qcuuj4w`) in all three arms, the
  original startup preload, deferral plus TTL, and the committed deferral at `'none'`, although prod's
  log proves the last keeps the guidebook out. So it does not discriminate, and no conclusion follows.

Separately, locally today the guidebook stamp lands within ~3 ms of the reference stamp in every arm,
unlike the ~1.3 s gap measured locally before. The likeliest reading is that locally the previous
client's desires are still live at the first sync, so prod's precondition ("6 to remove") does not
reproduce. Unconfirmed without the local zero-cache log, which runs in a terminal this session cannot
read. The churn comparison above still holds, since both arms ran the same procedure.

Lesson: a positive control that shows the expected value proves nothing until the opposite arm shows
the opposite value. The first control "went red" and was only exposed by the negative control.

### Decided by the local zero-cache log: the TTL is rejected

With the local log readable, one cold open on the TTL code (guidebook desires recorded at 10 m):

```text
syncQueryPipelineSet: 23 CVR queries, 21 custom re-transformed, 0 errored, 3 to remove, 20 to add
hydrating 20 queries          <- listRoutes, listBlocks, listAreas all hydrated in here
finished processing queries (process: 792 ms, wall: 878 ms)
syncQueryPipelineSet: ..., 0 to remove, 3 to add      <- the keyed preloads, still 'none'
flushing 1984 rows (1984 inserts, 0 deletes)
```

The TTL does stop the removal (3 to remove instead of 6), but a cached, inactive query IS hydrated
when a view-syncer cold-starts, so the guidebook lands back in the first batch: 878 ms here, the full
~12 s on prod, which is the original defect. Reverted to HEAD, never committed. The remove and re-add
churn is the price of the deferral; only a cheaper guidebook reduces it.

## Group 15: the prod-shaped, prod-speed local harness

**Shape (15.1, 15.2).** `seed-volume.ts` gained topos with files, topo lines, first ascensionists over a
shared pool, events, lognormal routes per block and areas to depth 4, all behind `PROFILE=prod`.
Reseeded as `RESET=true PROFILE=prod REGION_NAME='Volume Test' npx tsx src/lib/db/scripts/seed-volume.ts`
(with `DATABASE_URL` set). Every table within 10% of prod; routes per block realised 2 / 9 / 58 as on
prod. A member (`maintainer@`) syncs `listRoutes({})` 21,198 rows (prod 19,860), `listBlocks({})` 6,594
(prod 6,167), `listAreas({})` 745 (prod 760). The profile's routes-per-block p90 is 8.5, not the measured
9: a lognormal through 2 and 9 overshoots prod's route count by 16%, and the step is noise-dominated.

**Speed (15.3, 15.4).** `docker compose --profile perf up -d zero-perf`, after stopping `npm run dev:zero`.
Two traps fixed on the way: Vite 403s any host but localhost names, so the transform URL is
`app.localhost` mapped to the host gateway; and the instance runs under its own `ZERO_APP_ID` so it never
shares dev:zero's shard. Calibration, cold opens read off the server log:

| cap     | row records | first batch wall | `listRoutes({})` | guidebook batch wall |
| ------- | ----------- | ---------------- | ---------------- | -------------------- |
| 2       | 262 ms      | 804 ms           | 2,389 ms         | 3,027 ms             |
| 0.25    | 4,495 ms    | 3,315 ms         | 22,300 ms        | 26,808 ms            |
| 0.5     | 677 ms      | 679 ms           | 6,418 ms         | 8,213 ms             |
| **0.4** | 1,062 ms    | 887 ms           | **9,184 ms**     | 11,403 ms            |
| prod    | 598-686 ms  | 887 ms (A)       | 9,255-10,311 ms  | 12,749-13,408 ms     |

0.4 is the default in the profile. Row-record loading is the one phase slower than prod there.

**Acceptance (15.5).** New activity visible, measured from navigation, an event inserted while away:

|                                    | run 1     | run 2     |
| ---------------------------------- | --------- | --------- |
| with the deferral (committed code) | 5,628 ms  | 5,673 ms  |
| deferral reverted (control)        | 15,131 ms | 15,448 ms |

Signature 1 reproduces: the control puts the guidebook in the first batch (`3 to remove, 18 to add`,
`listRoutes` 9.1 to 9.5 s inside it, first-batch wall 12.7 to 12.9 s), which is prod's ~15 s.

Signature 2 does NOT: no `client closed` during any guidebook hydration across seven cold opens of 9 to
10 s, nor during one of 22.3 s at the 0.25 cap. Prod dropped about half. Cause unknown; the obvious
differences are a browser on localhost versus a phone over the internet, and a fractional CPU quota on
fast cores versus two slow cores. So, per 15.5, 14.3's disconnect criterion stays judged on prod; its
hydration-time criterion can be measured here.
