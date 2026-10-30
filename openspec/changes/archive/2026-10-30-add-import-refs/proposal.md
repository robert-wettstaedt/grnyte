# Proposal

## Why

The Frankenjura rebuild imports thousands of areas, blocks and routes from a printed guidebook. When the next edition
comes out, two questions must be answerable without guesswork: which DB row is which line of the book, and what did
people change after the import. Today nothing in the DB records either, which is what made matching the first import so
hard.

## What Changes

- New table `import_refs`: one row per (entity, source, line). It holds the stable line anchor in that source
  (`y95-123`, page and line), the source label (`boulderappell-2026`) and a jsonb snapshot of what the import wrote.
- An entity may hold several refs, across sources and editions and within one source (a Gebiet printed twice, merged DB
  duplicates). A soft-deleted entity keeps its refs, so the next import still matches it and does not bring it back.
- A small typed server helper to write and read refs, for the rebuild import (step 3/4) to call. No import writes rows
  in this change.
- `regionMove.ts` carries the new table when areas, blocks and routes move between regions. `purge-region.ts` picks it
  up by its `region_fk` with no edit.

## Capabilities

### New Capabilities

- `import-provenance`: records which source line each imported area, block and route came from, and what the import
  wrote, so a later edition or another source can be matched and person-made edits told apart.

### Modified Capabilities

None.

## Impact

- Tables: new `import_refs` (FKs to `areas`, `blocks`, `routes`, `regions`). No column on any existing table.
- Code: `src/lib/db/schema.ts`, a new migration under `drizzle/`, `src/lib/zero/zero-schema.gen.ts` (regenerated; the
  table is listed there like every table, but no query reads it), `src/lib/db/scripts/regionMove.ts`, and a new helper
  in `src/lib/db/scripts/`.
- No entity module, route, remote function, mutator or `manifest.id` changes. Nothing is client-breaking: no client
  query reads the table, so already-loaded tabs are unaffected across the deploy.
- zero-cache replicates the table server-side (its publication is every table in `public`).

## Non-goals

- The rebuild import itself, merging or splitting DB duplicates, and backfilling refs for the first (old edition)
  import.
- Any UI. The table is never shown to people.
- Reusing or migrating the unused 1.0 `route_external_resources` tables.
- A table describing sources (label, date, pipeline commit). The edition's files stay archived in `~/guidebook`.
