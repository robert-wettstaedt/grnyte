ALTER TABLE "user_settings" ADD COLUMN "legacy_pushed_up_to_activity_id" integer;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "legacy_seen_up_to_activity_id" integer;--> statement-breakpoint
-- Carry the two watermarks over before the originals go in the next migration. Nothing reads them
-- any more, but a cutover that has to look backwards should not find them empty.
UPDATE "user_settings"
SET "legacy_pushed_up_to_activity_id" = "pushed_up_to_activity_id",
    "legacy_seen_up_to_activity_id" = "seen_up_to_activity_id";
