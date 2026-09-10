-- The area type `crag` became `sector`: the leaf kind of area that holds blocks. "Crag"
-- survives as ordinary English prose, the same split CONTEXT.md already makes between
-- `block` (entity) and `boulder` (prose). See CONTEXT.md.
--
-- `areas.type` is plain `text` with a TypeScript-only enum, so there is no DDL here, only
-- data. Hand-written: `drizzle-kit generate` sees no schema diff.
UPDATE "areas" SET "type" = 'sector' WHERE "type" = 'crag';

-- The log rows too, the same shape 0093 needed. Today's code cannot write these: `updateArea`
-- passes only name and description to `createUpdateEvent`, and `refreshAreaType` writes the
-- column with no event at all. History can, though. 1.0 logged the whole entity including
-- `type`, and 0099 backfilled `activities` into `changes` on `column_name IS NOT NULL` with no
-- column whitelist (0099:385), so a production row can still hold 'crag'.
--
-- Nothing renders them today only because `verbs.ts` has no `area:update:type` entry, so the
-- line is dropped at render. That is an accident of the catalogue, not an absence of rows, and
-- it stops protecting anyone the moment somebody adds the entry.
--
-- Scoped to area rows, so an ascent's `type` and any row that merely holds the word are untouched.
UPDATE "changes" SET "new_value" = 'sector'
  WHERE "area_fk" IS NOT NULL AND "column_name" = 'type' AND "new_value" = 'crag';

UPDATE "changes" SET "old_value" = 'sector'
  WHERE "area_fk" IS NOT NULL AND "column_name" = 'type' AND "old_value" = 'crag';
