# query-phase-and-offline-registry notes

## 4.4 Re-measured on the zero-perf harness

Cold field-device opens of `/feed` (375 touch, IndexedDB and stamps cleared, fresh client group each),
three runs per arm, measured from iframe start. The HEAD arm swaps only `z.svelte.ts` and `offline.ts`
back to 0a4ee6c0, so it isolates the keep table and `preloadStage`.

| arm         | reference stamp | first feed card | guidebook stamp |
| ----------- | --------------- | --------------- | --------------- |
| this change | 0.6-1.3 s       | 3.4-6.8 s       | 3.4-6.8 s       |
| HEAD        | 679-876 ms      | 3,770-6,110 ms  | 3,770-6,110 ms  |

Guidebook stamp against 14.4's client-to-stamp (6.6 s and 7.0 s medians): same or earlier, so the staged
preload costs nothing. Desktop (no guidebook): first card 0.9-1.35 s.

On a COLD store the first card lands with the guidebook stamp in every run of both arms, so this
predates the change. It does not contradict 12.1, which measured a warm reopen, where the feed is
released with the reference batch. Likely cause, not verified: `/feed`'s events query is desired only
after the regions answer, which is the reference batch completing, so it joins the same hydration as
the guidebook preloads. A first install is the case it hurts; a follow-up, not this change.

## 5.4 Forms, driven

Cold (store cleared), 375 and 1280 on region 18. `routes/58694/edit` posts `known`, both tags and its
first ascensionist; `blocks/295/edit` posts its pin. A client-side hop `routes/58694/edit` to
`routes/58700/edit` in one document reseeds: the other route's tag and fingerprint, year field
remounted blank. `e2e/form-seeding.spec.ts`, run outside the sandbox (Chromium cannot launch inside it): 12 of 12
passed.

## 6.2 Group 16 re-measured

Same method as the archived table (buffered `layout-shift`, cold, 10 s), region 18 on the harness.

| Page                                        | 1280           | 375            | earlier 1280, 375          |
| ------------------------------------------- | -------------- | -------------- | -------------------------- |
| `/routes/58695` (drawn)                     | 0.0027         | 0.0040         | 0.0008, 0.0061             |
| `/routes/58694` (undrawn)                   | 0.0128, 0.0120 | 0.0129         | 0.0036, 0.0196             |
| `/areas/34342` sector, `/areas/34174` area  | 0.0029, 0.0024 | 0.0306, 0.0280 | 0.0026/0.0024, 0.031/0.028 |
| `/blocks/42274` topos, `/blocks/42275` none | 0.0029, 0.0027 | 0.0306, 0.0284 | 0.0026/0.0004, 0.020/0.029 |
| `/blocks/42274/topos/7618`                  | 0.0034         | 0.0034         | 0.0034, 0.0034             |
| `/users/3`                                  | 0.0001         | 0.0005         | 0, 0                       |
| `/regions/18`                               | 0.0051         | 0.0216         | 0.0053, 0.022              |
| `/feed`, `/search?q=route`                  | 0.0001, 0.0004 | 0, 0.0198      | 0.0001/0.0004, 0/0.0198    |

All under 0.1 and within the earlier range except the undrawn route at 1280. Its extra 0.010 is the
grade-opinions section going 117 to 107 px when the ascents answer: the held `SkeletonRows` row is
10 px taller than "No opinions". That branch is a one-for-one translation of `!ascents.settled`, and
this route has no ascents (the earlier one evidently had some), so it predates the change. Not fixed
here (a non-goal); the fix is the ascents line's: give the empty line the held row's height.

17.7 repeated: on a synced field device, reloading offline (probe rejected, a socket that never
opens) renders `/routes/58695` from the local copy with ascents "You're offline", and
`/routes/58695/edit` opens seeded with its tag and `known`.
