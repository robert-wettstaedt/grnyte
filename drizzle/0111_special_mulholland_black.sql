DROP INDEX "notifications_source_idx";--> statement-breakpoint
DROP INDEX "notifications_event_source_idx";--> statement-breakpoint
ALTER TABLE "notifications" DROP COLUMN "object_key";--> statement-breakpoint

-- Two rows that were distinct only under the two partial indexes are one row under the single key,
-- so drop the older of any such pair before the constraint goes on. `is not distinct from` is what
-- makes the nulls compare the way the constraint will.
DELETE FROM "notifications" a
USING "notifications" b
WHERE a."user_fk" = b."user_fk"
  AND a."source_type" = b."source_type"
  AND a."actor_fk" = b."actor_fk"
  AND a."event_fk" IS NOT DISTINCT FROM b."event_fk"
  AND a."area_fk" IS NOT DISTINCT FROM b."area_fk"
  AND a."ascent_fk" IS NOT DISTINCT FROM b."ascent_fk"
  AND a."block_fk" IS NOT DISTINCT FROM b."block_fk"
  AND a."file_fk" IS NOT DISTINCT FROM b."file_fk"
  AND a."route_fk" IS NOT DISTINCT FROM b."route_fk"
  AND a."subject_fk" IS NOT DISTINCT FROM b."subject_fk"
  AND a."id" < b."id";--> statement-breakpoint

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_source_idx" UNIQUE NULLS NOT DISTINCT("user_fk","source_type","actor_fk","event_fk","area_fk","ascent_fk","block_fk","file_fk","route_fk","subject_fk");
