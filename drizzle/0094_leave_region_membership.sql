-- Leaving a region and being removed from one wrote the same triple, `user:deleted:role`,
-- so the feed had one sentence for both and rendered a member who left as
-- "Mara removed Mara from the region". `leaveRegion` now writes `membership` instead.
--
-- `column_name` is plain `text`, so there is no DDL here, only data. Hand-written:
-- `drizzle-kit generate` sees no schema diff.
--
-- The predicate is exact rather than heuristic. `assertMemberChangeAllowed`
-- (src/lib/entities/region/guards.server.ts) rejects `userFk === actorUserFk`, so
-- `removeRegionMember` can never have written a row whose subject is its own actor.
-- A `user:deleted:role` row with `entity_id = user_fk` can only have come from `leaveRegion`.
UPDATE "activities" SET "column_name" = 'membership'
  WHERE "entity_type" = 'user'
    AND "type" = 'deleted'
    AND "column_name" = 'role'
    AND "entity_id" = "user_fk"::text;
