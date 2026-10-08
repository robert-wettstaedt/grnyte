# Proposal

## Why

`zero-latency-and-loading-states` gave every synced query honest readiness signals, but as raw flags
(`settled`, `availability`, `isEmpty`, `status`) that each screen recombines with `isOnline()`. An
architecture review of `feature/zero-latency` (grnyte-50, 2026-10-08) counted 75 `.settled` reads in
32 files, `isOnline()` in 24, and found screens already disagreeing about what "more rows may come"
means. The same review found two other decisions held in more than one place: the offline keep table
and the preloads that implement it (guarded by a test that reads `z.svelte.ts` as text), and the
"what does this screen show instead of its content" ladder, written once in `QueryState` and again
in the form gate. Fixing these now, while the readiness work is fresh and before more screens copy
the patterns, is cheaper than after.

## What Changes

- A synced query answers one question, its **phase** (loading, arriving, answered, unavailable,
  error), plus a total that exists only when answered. Screens read the phase instead of combining
  flags with the connection state. The individual flags and the exported resolver functions stop
  being public.
- The Zero client becomes something a query resource is given, so a resource can be built in a
  test. The phase is decided by one pure function with a truth-table test.
- One readiness ladder decides what any screen shows instead of its content (offline notice, error,
  not found, no permission, loading). `QueryState` and the form gate both render from it, the error
  card is one component, and the event page's composer reads it instead of a third copy.
- The offline keep table owns its preloads: each kept query names how its preload is built, and the
  preload step iterates the table. A query that is kept but never preloaded cannot be written, and
  the test that reads `z.svelte.ts` as source text is deleted.
- `Form` hands its fields the rows it waited for. Pages stop restating the wait (`settledX`), the
  non-null assertions on loaded rows go, and an edit form waits for whole rows unless it opts out.

No user-visible behavior is meant to change. Every screen is re-measured against the numbers
recorded in `archive/2026-10-08-zero-latency-and-loading-states/notes.md`.

## Capabilities

### New Capabilities

- `sync/offline-registry`: which synced queries are kept on the device, and the guarantee that
  every kept query is preloaded and no excluded one is.

### Modified Capabilities

- `sync/query-readiness` (from the archived `zero-latency-and-loading-states`): a query exposes
  one phase, every screen derives its fallback from one ladder, and a form never renders its fields
  before the rows it waits for.

## Touched

- `src/lib/zero/` (`resource.svelte.ts`, `offline.ts`, `z.svelte.ts`, `guidebook.ts`, the drift
  test), `src/lib/forms/` (`Form.svelte`, `FormGate.svelte`, `gate.ts`),
  `src/lib/components/QueryState/`, `src/lib/state/global.svelte.ts`, and the 32 files reading
  `.settled`: entity modules under `src/lib/entities/` (event, ascent, route, area, block,
  firstAscensionist), the profile, feed and search components, and the explore, route, area, block,
  region, event and form routes.
- No tables, no schema change, no migration. No remote function moves or is renamed, no URL
  changes, `manifest.id` is untouched: already-loaded tabs keep working across the deploy.

## Non-goals

- A shared "late section" module (review item 4). The held-space rules stay per page for now.
- Moving the feed's sync barrier onto the resource (review item 6). Revisit once the phase exists.
- The `deleted_at` follow-up, and any change to what is kept offline or how much of it.
- Any visual or copy change.
