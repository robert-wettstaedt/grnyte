# Proposal

## Why

Areas, blocks and routes each spell out their own delete and restore lifecycle, and it is about half
of each `.remote.ts` (`areas.remote.ts` 670 lines, `blocks.remote.ts` 703, `routes.remote.ts` 583).
The soft paths are one shape written several times: stamp `deletedAt` on a set of areas, then their
blocks, then those blocks' routes, guarded by "was null" on the way down and "was this stamp" on the
way back. Separately, the block pin's two-way link with `geolocations` (a geolocation row the block
points at, which points back at the block) is hand-copied at nine sites in `blocks.remote.ts`, with
two different write orders. Each copy is a place for the next edit to drift, and the 2026-10-16
code-quality review (findings CR-1 and CR-3) found the drift has already begun: the duplicated
sibling-name check had become a real bug (B1, fixed separately).

## What Changes

- A shared `stampDeletedAt` helper for the soft paths, so `softDeleteArea`, `softRestoreArea`,
  `softDeleteBlock`, `softRestoreBlock` and `deleteRoute`'s inline soft branch state the cascade once.
- Each entity's hard and soft delete and restore helpers move out of its `.remote.ts` into a new
  `<entity>/lifecycle.server.ts` (`area`, `block`, `route`). `deleteRoute`'s inline hard path becomes
  helpers of the same shape as area's and block's.
- A new `block/pin.server.ts` owns the pin link: `attachPin`, `movePin` (where an omitted `estimated`
  keeps the stored flag, as the map drag does today) and `removePin`. All nine sites call it.
- `restoreRoute`'s snapshot schema stops accepting `areaFks`, `areaIds`, `createdBy` and `regionFk`,
  which it validates and never reads (the insert derives all four from the stored block and the
  session). `deleteRoute` stops putting them in the snapshot.
- Every remote export stays in its `.remote.ts` file under its current name.

Not client-breaking. No `.remote.ts` file moves and no remote export is renamed or removed, so remote
endpoint ids are unchanged. An undo toast opened before the deploy still sends the old route snapshot;
the schema strips the four extra keys on parse (zod/mini object), so that restore still works.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. Behaviour-preserving refactor (see Non-goals for what is deliberately left alone), so the change
sets `skip_specs: true`.

## Non-goals

- Making the three hard-restore placement gates one rule. Today `restoreArea` and `restoreBlock`
  check the snapshot's region against the stored parent, while `restoreRoute` ignores the snapshot's
  placement and derives it from the stored block. Either direction changes which restores are refused,
  which is a security-relevant behaviour change; it needs its own change and its own review.
- A generic CRUD factory across entities: the placement gates and cascades differ in ways that matter.
- `areas.type` refresh by trigger (review CR-7), `updateRoute`'s list writes (CR-4), form field
  components (CR-8) and permission predicate sharing (CR-9).
- Any schema, migration, i18n or UI change.

## Impact

- Remote modules (exports unchanged): `src/lib/entities/area/areas.remote.ts`,
  `src/lib/entities/block/blocks.remote.ts`, `src/lib/entities/route/routes.remote.ts`.
- New server modules: `src/lib/entities/{area,block,route}/lifecycle.server.ts`,
  `src/lib/entities/block/pin.server.ts`, and the `stampDeletedAt` helper (home decided in design).
- Tables written by the moved code, unchanged in how: `areas`, `blocks`, `routes`, `geolocations`,
  `routes_to_tags`, `routes_to_first_ascensionists`, the route external-resource tables, `events`.
- Tests: `blocks.remote.test.ts`, `pin.remote.test.ts`, `areas.remote.test.ts`,
  `softRestore.remote.test.ts`, `remote/restoreSnapshots.remote.test.ts`,
  `remote/restoreFidelity.remote.test.ts`, `remote/softDeletedParent.remote.test.ts`,
  `area/guards.server.test.ts`.
