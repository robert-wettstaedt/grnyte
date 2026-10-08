# Design

## Context

See proposal.md for the why. The pieces this extends, all from `zero-latency-and-loading-states`:

- `QueryResource` (`$lib/zero/resource.svelte.ts`): a class built by `createResource`, reading the Zero
  client through `getZ()`. It exposes `data`, `status`, `availability`, `isEmpty`, `isComplete`,
  `isSyncing` and `settled`, plus exported pure resolvers (`resolveArriving`, `resolveAvailability`,
  `resolveEmpty`, `resolveKept`, `resolveLoading`, `resolveSettled`, `resolveUnavailable`). They are
  exported only because the class cannot be constructed in a test.
- `QueryState.svelte` and `FormGate.svelte` + `gate.ts` (`resolveFormGate`), which each decide the
  fallback state in the same order and each render the same error card.
- `offline.ts` (`OFFLINE_QUERIES`, `GUIDEBOOK_COVERED`, `offlinePolicyOf`), `z.svelte.ts`
  (`initZero`'s reference preload, `preloadForOffline`), `guidebook.ts`, and
  `offline.drift.test.ts`, which checks the first two against each other by reading `z.svelte.ts`
  as text. Some kept queries need arguments (`{ userId }` after a `currentUser` lookup,
  `{ regionFks }` after `listUserRegions`), which is why the table stayed name-only.
- `Form.svelte`'s `waitFor` / `denied`, and the 11 form pages that moved onto it.

All reads stay Zero queries and all writes stay remote functions; nothing here touches either side
of that line. No schema change, no backfill.

## Goals / Non-Goals

**Goals:**

- One public readiness answer per resource, decided by one pure function with a truth-table test.
- A resource buildable in a test with a fake Zero client.
- One fallback ladder for every screen; one error card.
- One place that both classifies and preloads offline queries.
- Form children receive their rows typed and non-null.

**Non-Goals:**

- Changing what any screen shows. This is a refactor measured against the previous numbers.
- Changing the feed's sync barrier, the late-section patterns, or what is kept offline.

## Decisions

### `phase` replaces the public flags

`QueryResource` gains `phase`, a tagged union: `loading`, `arriving`, `answered` (with `empty`),
`unavailable` (with `excluded`), `partial`, `error`. `data` stays, and a total is `data.length` read
only when answered. `partial` was found while implementing: offline, rows on hand that were never
confirmed are neither arriving (nothing is coming) nor answered (no total or absence may be
claimed); screens already showed them without either, and the phase now names that case. `settled`, `availability`,
`isEmpty`, `isComplete` and `isSyncing` leave the public interface once their callers have moved;
the resolvers become module-internal and are reached through `resolvePhase`. As built,
`resolveAvailability`, `resolveSettled`, `resolveKept`, `sameViews` and `resolvePolicy` stay
exported for their own truth-table tests; the arriving, empty and unavailable ones are internal.

Callers that today write `!settled && isOnline()` mean "more may still come, including the first
row": that is `loading` or `arriving`, and a small exported helper (`expectingMore(phase)`) names it
so nobody re-derives it. `arriving` keeps its current meaning (rows on screen). The latch keeps its
current semantics: once answered, a parked socket does not undo it, and offline a kept query that
finished its preload counts as answered.

Alternative considered: keep the flags and add `phase` beside them. Rejected, because the drift came
from having several public answers; a second set only adds one more.

### The Zero client is injected

`createResource` takes the client from a small source interface (`createQuery`, `materialize`,
`connectionState`) that defaults to `getZ()`. Tests pass a fake that emits result types and rows.
This is what lets the phase logic be tested through the class, and lets the resolvers stop being
exported.

Alternative considered: keep the class untestable and test only `resolvePhase`. Rejected: the
review's point is that call sites drifted from the resolvers, and only a test through the resource
shows the resource still calls them.

### One ladder, two renderers

`gate.ts`'s `resolveFormGate` generalises into the one ladder (it already takes ordered waits and a
`denied` input), reading `phase`. `QueryState` renders it for a single wait with no `denied`;
`FormGate` renders it with the form chrome. The error card becomes `QueryError.svelte` beside
`QueryState`. The event page's composer reads the ladder's result for its one wait instead of
re-deriving it.

Equivalence is checked with the Storybook fingerprint diff (every `QueryState`, `FormGate` and
`EventFilters` story before and after) plus the existing `gate.test.ts`, rewritten against the
general ladder.

### The keep table owns its preloads

`offline.ts`'s table changes from names per policy to one entry per kept query: its policy, its
stage (`reference`, then `field`), and how its request is built. A builder receives a context with
lazily resolved lookups (`userId()`, `regionFks()`), so the two queries that wait on a lookup are
ordinary entries. `initZero` and `preloadForOffline` iterate the table by stage instead of listing
calls; the reference stage still completes, and stamps, before the field stage starts.
`offlinePolicyOf` reads the same table, and `GUIDEBOOK_COVERED` stays as is (those are answered from
the guidebook rows, never preloaded).

The table is typed by query name, so an entry whose builder returns a different query is a compile
error. `offline.drift.test.ts` loses its source-text checks; a unit test builds every entry's
request against a fake context and asserts the name, and the guidebook coverage tests stay.

Alternative considered: generate the preload list from the names and keep arguments in a side map.
Rejected: it is the current split under a new name.

### Form hands over its rows, and `whole` is never implicit

`waitFor` becomes typed by its resources, and `Form` renders its fields through a snippet that
receives each wait's data, non-null and settled where the wait is `whole`. `whole` becomes a
required field of every wait, so an edit form cannot get the weaker wait by omission. `Form` also
runs the seed for the waited rows (keyed on the rows' ids, once per id), so pages drop their
`settledX` copies and the `{#key}` blocks that only existed to re-key on the loaded id. `FormGate`
keeps its standalone use for `BlockEditor`, block add and block order, with the same typed snippet.

Alternative considered: keep `data!` at call sites. Rejected: the 15 assertions are where the
gate's guarantee falls out of the type system.

## Risks / Trade-offs

- **Wide diff.** 32 files read `.settled`. Mitigation: migrate in batches with the old getters still
  present, remove them last, and let knip and the typecheck prove nothing still reads them.
- **Svelte generics for tuple-typed snippets** may be awkward. Fallback: one wait passes its data
  through the snippet, several pass an object keyed by name. As built: a tuple. An object was tried
  and dropped, because lint sorts its keys and the key order is the ladder's order. `const` in a
  `generics` attribute typechecks but the Svelte ESLint parser rejects it, so `FormWaits` is the
  non-empty tuple `readonly [FormWait, ...FormWait[]]`, which infers a literal as a tuple without it.
  The gate also runs the seed: children mount only after their rows' seed, mounted children stay
  mounted across a new id (`BlockForm` owns its `<form>`), and `Form` re-keys only its `fields`.
- **A refactor that changes behavior unnoticed.** Mitigation: the fingerprint diff for components,
  the CLS table re-measured on the prod-speed harness, the offline reload check from 17.7, and
  `e2e/form-seeding.spec.ts`.
- **Preload order regressions** cost the first screen seconds. Mitigation: re-run the 14.4 harness
  measurement and the 12.x feed pill check after the registry lands.
