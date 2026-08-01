-- The ascent type `send` became `redpoint`: the strict "worked it, then sent it"
-- type that sits next to `flash` and `repeat`. "Send" is now the umbrella for all
-- three, which is what `stats.sends` has always counted. See CONTEXT.md.
--
-- `ascents.type` is plain `text` with a TypeScript-only enum, so there is no DDL
-- here, only data. Hand-written: `drizzle-kit generate` sees no schema diff.
UPDATE "ascents" SET "type" = 'redpoint' WHERE "type" = 'send';

-- The activity log stores the same value as text: `createAscent` writes it into
-- `new_value`, `deleteAscent` into `old_value`. Missing these would leave the feed
-- selecting `activity_ascentCreatedSend` for historical rows, a key that no longer
-- exists, and one whose word now means the umbrella rather than the strict type.
-- Scoped to ascent rows so a route or block that happens to be named "send" is untouched.
UPDATE "activities" SET "new_value" = 'redpoint'
  WHERE "entity_type" = 'ascent' AND "type" = 'created' AND "new_value" = 'send';

UPDATE "activities" SET "old_value" = 'redpoint'
  WHERE "entity_type" = 'ascent' AND "type" = 'deleted' AND "old_value" = 'send';

-- `updateAscent` logs a type change as a column diff, so both ends of it are stored.
UPDATE "activities" SET "new_value" = 'redpoint'
  WHERE "entity_type" = 'ascent' AND "column_name" = 'type' AND "new_value" = 'send';

UPDATE "activities" SET "old_value" = 'redpoint'
  WHERE "entity_type" = 'ascent' AND "column_name" = 'type' AND "old_value" = 'send';
