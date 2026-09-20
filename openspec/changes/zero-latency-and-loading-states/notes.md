# Measurements

Working notes for this change. Tasks 2.2, 2.3, 3.5, 4.2, 4.3 and 6.1 all record here.

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

## 2.0 PRE-step-0 feed reading (prod, 2026-09-20)

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

## 2.2 Cold feed baseline (post-step-0)

NOT CAPTURED. Due after step 0 deploys.

## 2.3 Warm feed baseline (post-step-0)

NOT CAPTURED. Due after step 0 deploys.

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
