# Measurements

Working notes for this change. Tasks 2.2, 2.3, 3.5, 4.3, 4.4 and 6.1 all record here.

## 2.1 Deployment values, recorded before any change

| Value | Setting | Source |
| --- | --- | --- |
| `ZERO_NUM_SYNC_WORKERS` | **2** | user, 2026-09-20 |
| VPS cores | 2 (arm64, Hetzner CAX11, 4 GB) | `/statz?group=os` |
| `maxRecentQueries` | 0 (Zero default, never set) | `zero.js:229` + grep of `src/` |
| `ZERO_CVR_DB` | unset, so the CVR lives in upstream Supabase | grep of repo |

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

| Reading | Queries | Slowest `hydrateTotal` |
| --- | --- | --- |
| 2.0 "cold", reached by clicking | 16 | **3810 ms** |
| 2.0b cold, typed into a fresh tab | 12 | **503 ms** |

**The feed was never slow.** 3810 ms was four leaked map queries riding along from a previous
`/explore` visit in the same tab. A genuinely cold feed is 503 ms, with ~321 ms of server work spread
across twelve queries, the largest being `listEvents({limit:50})` at 145 ms.

Warm, after clicking to Explore and back, 16 queries, slowest **4607 ms**. Every query from the cold
set kept its cold total exactly (503, 503, 502 and so on), so none of them re-hydrated. The entire
warm cost is the four map queries hydrating for the first time:

| Query | server ms | total ms |
| --- | --- | --- |
| `listBlocks({})` | **2081** | 4602 |
| `listAreas({})` | 360 | 4599 |
| `listRoutesForMap({})` | 358 | 4607 |
| `listFirstAscensionists({})` | 13 | 4534 |
| | **2812 total** | |

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

| Query | rows | server ms | total ms |
| --- | --- | --- | --- |
| `listBlocks({})` | 5,966 | **2104.8** | 3714 |
| `listRoutesForMap({})` | 6,642 | 422.3 | 3722 |
| `listAreas({})` | 753 | 411.3 | 3719 |
| `listEvents({limit:50})` | 226 | 145.6 | 516 |
| `listEvents({limit:50,upTo})` | 226 | 134.2 | 2963 |
| `blockTopos({blockId:[]})` | 0 | 1.0 | 3059 |
| `listNotifications({limit:100})` | 0 | 14.3 | 1077 |
| (9 others) | | < 13 each | |

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

| Phase | Default 5000 | Tightened 2000 |
| --- | --- | --- |
| swallowed ping to socket CLOSE (the pong deadline) | **5.0 s** | **2.0 s** |
| CLOSE to reconnected (`RUN_LOOP_INTERVAL_MS` backoff) | **5.0 s** | **5.0 s** |
| from the ping that timed out to connected | **10.1 s** | **7.0 s** |
| worst case from the socket dying, including the idle wait | **~15 s** | **~9 s** |

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

| Step | Queries | Unbounded map queries |
| --- | --- | --- |
| fresh `/feed` | 11 | **none** |
| `/explore` | 15 | all four (correct, the map draws them) |
| back on `/feed` | 15 | **all four still there** |

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

| | Queries | Slowest total | Server work |
| --- | --- | --- | --- |
| pre-step-0 cold (2.0b) | 12 | **503 ms** | ~321 ms |
| post-step-0 cold (2.2) | 11 | **882 ms** | ~284 ms |

Step 0 did what it was meant to: one fewer registration, ~37 ms less server work. But wall clock moved
379 ms the WRONG way on nominally identical captures. Since server work fell, that difference is all
in the non-server component, which is run-to-run variance on production.

**Single samples of `hydrateTotal` cannot resolve an effect this size**, and the fix is to stop
measuring `hydrateTotal`. Across the same captures:

| Metric | Readings | Spread |
| --- | --- | --- |
| slowest cold `hydrateTotal` | 503, 882 ms | **~75%** |
| `listEvents({limit:50})` server | 145.5, 132.7 ms | ~9% |
| `listBlocks({})` server | 2104.8, 2081.3, 1868.6 ms | ~12% |

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

| | pre-step-0 | post-step-0 |
| --- | --- | --- |
| queries on a cold feed | 12 | **11** |
| notification query server | 10.8 ms (`listNotifications`) | **2.3 ms** (`countUnreadNotifications`) |

A 79% drop on that query, cleanly resolved from three samples each. Small in absolute terms, about
8.5 ms, but it is a real effect measured through the noise, which is the point: the metric works.

### And `hydrateTotal` still does not

| | median | range |
| --- | --- | --- |
| cold slowest, pre-step-0 | 447 ms | 437 to 545 |
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
