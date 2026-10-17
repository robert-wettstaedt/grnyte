# Design

## Context

See proposal.md for the why. What shapes the how:

- All of this is write-side code inside SvelteKit remote functions (`authedForm` / `authedCommand`),
  running on the caller's RLS transaction (`ctx.db`). No Zero query or mutator is involved, and the
  helpers keep taking the caller's `db`, so every write stays under the same RLS role and claims.
- A remote endpoint id is `hash(module path) + '/' + exportName` (AGENTS.md), so the exported handlers
  (`deleteArea`, `restoreArea`, `deleteBlock`, `restoreBlock`, `setBlockLocation`,
  `estimateBlockLocationFromPhoto`, `createBlock`, `updateBlock`, `deleteRoute`, `restoreRoute`) stay
  in their `.remote.ts` files. Only their private helpers move.
- `src/lib/entities/area/area.server.ts` already owns the hierarchy helpers both blocks and routes
  import (`areaAncestry`, `blockIsStranded`, `hasDeletedAncestor`, `refreshAreaType`).
- `src/lib/entities/block/pin.ts` is client-side (it imports `$app/paths` and EXIF parsing), so server
  pin writes cannot live there.
- Observed differences the change must keep:
  - The soft cascade on delete is guarded by `deletedAt IS NULL`; on restore by `deletedAt = <stamp>`
    (area and block), so restoring the parent never revives a child deleted separately.
  - `restoreRoute`'s soft path clears `deletedAt` with no stamp guard (`routes.remote.ts:577`).
  - `createBlock` inserts the geolocation first (no `blockFk`), the block with `geolocationFk`, then
    back-links `blockFk`. `updateBlock`'s attach inserts the geolocation with `blockFk` and leaves
    `blocks.geolocationFk` to the block update that follows; the remaining sites insert with
    `blockFk`, then set `blocks.geolocationFk` straight away.
  - `updateBlock` sets `estimated` from the form; `setBlockLocation` (map drag) keeps the stored
    flag; `estimateBlockLocationFromPhoto` writes `estimated: true`; hard restore writes the snapshot's.

## Goals / Non-Goals

**Goals:**

- Same final rows and the same events for every lifecycle and pin path, proven by the existing
  DB-backed suites passing unmodified, plus new direct tests for the new helpers.
- Each `.remote.ts` handler reads as gate, then helper calls, then event.

**Non-Goals:**

- Changing any gate, any guard or any write a reader could observe (see proposal Non-goals).

## Decisions

1. **`stampDeletedAt` lives in `area/area.server.ts`.** Signature
   `stampDeletedAt(db, { areaIds?, blockIds?, routeIds? }, to: Date | null, from: Date | null)`:
   updates `areas` by id, then `blocks` by id, then `routes` by `blockFk IN blockIds` or `id IN
routeIds`, each guarded by `deletedAt IS NULL` when `from` is null and `deletedAt = from`
   otherwise, skipping empty sets, in that order. It extends the module that already owns the
   hierarchy rather than adding a fifth place for it.
   - `restoreRoute`'s unguarded soft clear does NOT use it: routing it through the helper would add a
     stamp guard, which is a behaviour change (narrow, but real). It stays one inline statement, with
     a one-line comment saying why it is not the helper.
   - Rejected: a per-entity copy. That is the duplication being removed.
2. **One `lifecycle.server.ts` per entity.** `area/lifecycle.server.ts` gets `collectAreaSubtreeIds`,
   `hardDeleteArea`, `softDeleteArea`, `hardRestoreArea`, `softRestoreArea` and the snapshot types;
   `block/lifecycle.server.ts` gets the block equivalents plus `shiftBlockOrdersDown/Up`;
   `route/lifecycle.server.ts` gets `hardDeleteRoute`, `softDeleteRoute` and `hardRestoreRoute`,
   extracted from `deleteRoute` / `restoreRoute`'s inline branches. Bodies move verbatim except where
   a call to `stampDeletedAt` or a pin helper replaces the inline statements it equals. One input
   moves: `restoreRoute` filters the snapshot's tags against the region vocabulary itself and hands
   `hardRestoreRoute` the result (from `block.regionFk`, the value the old code read off the created
   row), so the helper needs no `userRegions`.
   - Rejected: a generic lifecycle module over all three. The gates and cascades differ (proposal).
3. **`block/pin.server.ts` owns the pin link.**
   - `attachPin(db, block: { id, regionFk }, at: { estimated, lat, long })`: insert the geolocation
     with `blockFk`, set `blocks.geolocationFk`, return the row.
   - `movePin(db, pinId, at: { lat, long, estimated? })`: update in place; an omitted `estimated`
     keeps the stored flag (`setBlockLocation`), a given one writes it (`updateBlock`).
   - `removePin(db, block: { id, geolocationFk })`: clear `blocks.geolocationFk`, then delete the row
     (the order the FK needs).
   - `createBlock` switches to the common order: insert the block with no pin, then `attachPin`. The
     final rows are identical (the block points at the pin, the pin at the block, same `regionFk`),
     but the write order changes, and `blocks.remote.test.ts` plus a new create-with-pin assertion
     pin it.
   - `updateBlock`'s attach now sets `blocks.geolocationFk` inside `attachPin` and again in the block
     update after it, to the same value: one redundant write, same final row. These two are the only
     places the pin writes are not a byte move.
4. **The route snapshot drops the dead fields.** `DeleteRouteSnapshot.route` and `restoreRouteSchema`
   lose `areaFks`, `areaIds`, `createdBy` and `regionFk`. zod/mini objects strip unknown keys, so an
   old toast's snapshot still parses, and `restoreSnapshots.remote.test.ts` (which forges exactly
   those fields) keeps passing as a parse-level guard.
5. **New direct tests** for `stampDeletedAt` and the three pin helpers, so the new modules have a test
   that imports them (the mutation runner needs one, AGENTS.md). Each is seen red once.

## Risks / Trade-offs

- [`createBlock`'s new write order meets an RLS policy the old order avoided] → the pin insert now
  carries `blockFk` like every other pin site already does under the same policy; the create-with-pin
  test runs it under RLS.
- [A stamp-guard difference slips in during the move] → Decision 1 lists the one unguarded path and
  keeps it inline; `softRestore.remote.test.ts` and `softDeletedParent.remote.test.ts` cover the
  guarded ones.
- [Moved helpers lose an import the `.remote.ts` relied on transitively] → typecheck, then the six
  DB-backed suites unmodified.
- [jscpd reads moved code as new clones] → accept into the baseline only for moved code, and say so.

## Migration Plan

None: no data, URL or endpoint change. Rollback is reverting the commit.
