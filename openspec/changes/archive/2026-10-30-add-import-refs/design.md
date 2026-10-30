# Design

## Context

See proposal.md for why. Facts that shape the approach:

- `areas`, `blocks` and `routes` soft-delete through `deletedAt`. A row is removed for real only by scripts.
- `purge-region.ts` deletes every table with a `region_fk` column, found from `information_schema`, with foreign keys off
  (`session_replication_role = replica`). A cascade therefore does not fire during a purge.
- `regionMove.ts` (`split-region.ts`, `move-area.ts`) asserts its `HANDLED_TABLES` against the same catalogue and
  refuses to run when a `region_fk` table is missing from it.
- `drizzle-zero` lists every table of `schema.ts` in `zero-schema.gen.ts`, and zero-cache's publication is every table in
  `public`. A table reaches a client only through a query in `src/lib/zero/queries`.
- The 1.0 `route_external_resources` tables cover routes only, one table per platform, and nothing writes them.

## Goals / Non-Goals

**Goals:**

- One table that serves any future import source without a schema change.
- Constraints in the database, not in the importer: one target per ref, one entity per line and kind.

**Non-Goals:**

- A typed snapshot shape per kind. The import that writes a snapshot defines it.
- Reading refs from the app.

## Decisions

**Table `import_refs` in `public`, after `routes` in `schema.ts`.** Columns: `baseFields` (`id`, `createdAt`),
`baseRegionFields` (`region_fk`), `area_fk`, `block_fk`, `route_fk` (nullable, `on delete cascade`), `source` text not
null, `ref` text not null, `imported` jsonb not null (`$type<Record<string, unknown>>()`). Alternatives: a `referenceId`
column per entity (one slot, overwritten by the next edition, synced to every client by the entity queries), one table
per kind (three copies of one shape), `(kind, entity_id)` without a foreign key (no cascade, no integrity). A separate
Postgres schema keeps the table out of zero-cache's copy, but would be the repo's first table outside `public`.

**Checks.** `num_nonnulls(area_fk, block_fk, route_fk) = 1`; `source <> ''` and `ref <> ''`.

**Uniqueness: three partial unique indexes**, `(source, ref) where route_fk is not null` and the same for blocks and
areas. A block and its route may share a printed line, two routes may not. An index on each FK serves the cascade and
the lookup by entity.

**`region_fk` is stored**, although the entity implies it: a purge runs with foreign keys off and finds tables by this
column, so without it the refs of a purged region would be orphaned. The helper sets it from the entity's region, never
from input.

**RLS enabled with no policies** (`.enableRLS()`, no `createBasicTablePolicies`). `authenticated` gets no row; the
import connects as the table owner and bypasses RLS. No Zero query, mutator or remote function is added, so reads and
writes happen only in server-side scripts.

**`regionMove.ts`**: add `import_refs` to `HANDLED_TABLES`, and in `carryContent` one update per kind from `map_area`,
`map_block` and `map_route`, as `routes_to_tags` does.

**Helper `src/lib/db/scripts/importRefs.server.ts`**, next to the scripts that will call it, two functions on a drizzle
transaction:

- `recordImportRefs(tx, source, regionId, refs)`: inserts `{ kind, id, ref, imported }[]`; `region_fk` comes from a join on the
  entity, and an entity outside `regionId` throws, so it writes the scope `importRefsOf` reads. A conflict throws; the
  caller decides what a repeated line means.
- `importRefsOf(tx, source, regionId)`: every ref of one source in one region, soft-deleted entities included, as
  `{ kind, id, ref, imported }[]`.

Merging and splitting refs during the rebuild belong to the import that does the merging.

## Risks / Trade-offs

- [zero-cache keeps a server-side copy of every ref, about 10k rows with snapshots per guidebook import] → Accepted; no
  client reads it. A separate schema is the fix if the replica size matters later.
- [The main checkout holds an uncommitted migration `0141` (`events.batch`) from the earlier repair approach] → Check
  `drizzle/` before `generate:drizzle` and renumber on merge, per AGENTS.md.
- [`regionMove.ts` has uncommitted edits in the main checkout] → Apply this change's edit on top of them, not over them;
  check `git diff` first.
- [The `imported` snapshot is untyped jsonb] → Accepted; the import owns its shape, and a later typed reader can narrow
  it.

## Migration Plan

Additive: one new table, no backfill (no import has written refs yet). Rollback is dropping the table. Deploy order does
not matter for clients, since no client code reads it.
