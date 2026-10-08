# Tasks

`zero-latency-and-loading-states` is archived, so `sync/query-readiness` is a main spec.
Group order is the dependency order: the phase first, then everything that reads it.

## 1. The phase, decided once

- [x] 1.1 Add `resolvePhase` to `resource.svelte.ts` over the existing resolvers, with a truth-table
      test covering every combination the current resolvers' tests cover. Verify by running
      `npm run test:mutation -- --mutate src/lib/zero/resource.svelte.ts` and reading every survivor
- [x] 1.2 Inject the Zero client into `createResource` through a source interface defaulting to
      `getZ()`, and add a fake. Verify with a test that builds a resource on the fake and walks it
      through loading, arriving, answered, a parked socket and offline
- [x] 1.3 Expose `phase` and `expectingMore` on `QueryResource`, keeping the old getters for now.
      Verify the new test passes and the full browser suite is unchanged

## 2. Callers read the phase

- [x] 2.1 Migrate `$lib/zero`, `$lib/state` and `$lib/entities` readers of `.settled`,
      `availability`, `isEmpty`, `isComplete` and `isSyncing`. Verify with typecheck and the
      browser suite
- [x] 2.2 Migrate `$lib/components` (QueryState, Profile, EventFeed, EntitySearch, Filter)
- [x] 2.3 Migrate the explore routes (map, areas, blocks, topo viewer, search) and the feed
- [x] 2.4 Migrate the route, region, event, user and settings pages
- [x] 2.5 Remove the old public getters and un-export the resolvers. Verify `npm run lint:unused` and
      the typecheck report nothing still reading them

## 3. One fallback ladder

- [x] 3.1 Generalise `resolveFormGate` into the shared ladder reading `phase`, and port
      `gate.test.ts` to it; see each rewritten test red once
- [x] 3.2 Extract `QueryError.svelte` and render it from both `QueryState` and `FormGate`
- [x] 3.3 Render `QueryState` from the ladder. Verify with the Storybook fingerprint diff over every
      `QueryState` and `FormGate` story, before and after. Done as a text comparison: the FormGate
      stories' rendered text matches the sweep recorded before the change, QueryState's five render
      their branches; no stored pre-change fingerprint existed to diff paths and images against
- [x] 3.4 Point the event page's composer at the ladder's result instead of its own condition

## 4. The keep table owns its preloads

- [x] 4.1 Reshape `OFFLINE_QUERIES` into per-query entries (policy, stage, request builder with a
      lookup context), keeping `offlinePolicyOf`'s answers identical. Verify with a test comparing
      every query's policy before and after
- [x] 4.2 Make `initZero`'s reference preload and `preloadForOffline` iterate the table by stage,
      keeping the reference-then-field order and both stamps
- [x] 4.3 Replace the source-text checks in `offline.drift.test.ts` with a test that builds every
      entry's request against a fake context and asserts its name; keep the coverage tests
- [x] 4.4 Re-measure on the prod-speed harness: the guidebook batch timing from 14.4 and the feed
      pill from 12.x, cold on a field device, and record both beside the earlier numbers

## 5. Form hands over its rows

- [x] 5.1 Type `waitFor` by its resources, make `whole` required, and render `Form`'s fields through
      a snippet receiving the waited data. Add a `FormGate` story per wait shape
- [x] 5.2 Move the per-id seed into `Form`, keyed on the waited rows' ids
- [x] 5.3 Migrate the 11 form pages and `BlockEditor`, removing `settledX`, the redundant `{#key}`
      blocks and every `data!`. Verify `rtk grep '\.data!' src/routes` finds none in form pages
- [x] 5.4 Run `e2e/form-seeding.spec.ts` and drive the route and block edit forms cold, checking the
      submit carries the loaded tags, first ascensionists and pin

## 6. Verification sweep

- [x] 6.1 Over the touched paths: prettier, eslint, the browser and server vitest projects,
      typecheck, `npm run lint:duplication`, `npm run lint:unused`
- [x] 6.2 Drive every screen listed in `archive/2026-10-08-zero-latency-and-loading-states/notes.md`, "Group 16,
      measured", cold at 375x667 and 1280x800, and record that each layout shift is within the
      earlier numbers; repeat the offline reload check from 17.7
