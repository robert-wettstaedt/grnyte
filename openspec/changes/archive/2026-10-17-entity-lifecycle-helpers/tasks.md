# Tasks

## 1. Shared helpers, test-first

- [x] 1.1 Add `stampDeletedAt` to `src/lib/entities/area/area.server.ts` (Decision 1) with a DB-backed
      test that stamps a subtree and restores only rows carrying that stamp; seen red once.
- [x] 1.2 Create `src/lib/entities/block/pin.server.ts` with `attachPin`, `movePin` and `removePin`
      (Decision 3) and a DB-backed test covering attach, move with and without `estimated`, and
      remove; seen red once.

## 2. Pin sites

- [x] 2.1 Point `updateBlock`, `setBlockLocation`, `estimateBlockLocationFromPhoto`, the block hard
      delete and the block hard restore at the pin helpers; verify `pin.remote.test.ts` and
      `blocks.remote.test.ts` pass unmodified.
- [x] 2.2 Switch `createBlock` to insert the block, then `attachPin`; add a create-with-pin assertion
      (both FKs set, same `regionFk`) to `blocks.remote.test.ts`, seen red once.

## 3. Lifecycle modules

- [x] 3.1 Create `src/lib/entities/area/lifecycle.server.ts` with the area helpers moved verbatim, the
      soft paths calling `stampDeletedAt`; verify `softRestore.remote.test.ts` and
      `areas.remote.test.ts` pass unmodified.
- [x] 3.2 Create `src/lib/entities/block/lifecycle.server.ts` likewise, including the order shifts;
      verify `blocks.remote.test.ts` and `reorder.remote.test.ts` pass unmodified.
- [x] 3.3 Create `src/lib/entities/route/lifecycle.server.ts` with `hardDeleteRoute`,
      `softDeleteRoute` (via `stampDeletedAt`) and `hardRestoreRoute` extracted from
      `routes.remote.ts`; keep `restoreRoute`'s soft clear inline with its one-line reason; verify
      `routes.remote.test.ts` passes unmodified.
- [x] 3.4 Drop `areaFks`, `areaIds`, `createdBy`, `regionFk` from `DeleteRouteSnapshot` and
      `restoreRouteSchema`; verify `restoreSnapshots.remote.test.ts` and
      `restoreFidelity.remote.test.ts` pass unmodified.
- [x] 3.5 Confirm every remote export is still in its original `.remote.ts` under its original name
      (diff the export lists before and after).

## 4. Verification sweep

- [x] 4.1 Over the touched paths: `npx prettier --write`, `npx eslint`, `npx vitest run --project
server` for the entity and `src/lib/remote` suites, and `svelte-check` (beside a running dev
      server, per AGENTS.md).
- [x] 4.2 `npm run lint:duplication` and `npm run lint:unused`; accept moved clones only, and say so.
- [x] 4.3 Drive the running app at 375x667 and 1280x800: create a block with a pin, move it on the map,
      clear it in the edit form; delete and undo a bare block, a block with routes, an area subtree and
      a route; confirm rows and the feed match the behaviour before the change.
