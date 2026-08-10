ALTER TABLE "notifications" ADD COLUMN "pushed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "notify_ascents" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "notify_crag_edits" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "notify_community" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "notify_directed" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "pushed_up_to_activity_id" integer;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "seen_up_to_activity_id" integer;--> statement-breakpoint
-- Everything that exists right now is already handled: 1.0 tracked that on `activities.notified`,
-- which 0097 drops, and 2.0 tracks it per person on this watermark. A null watermark is a floor of
-- 0, so without this every 1.0 device that carried its subscription across is pushed a digest of
-- the region's entire history, 500 activities at a time, once every five minutes until the mark
-- catches up to the present. Same value `subscribeToPush` writes for a first-time subscriber, and
-- for the same reason. `seen_up_to` stays null: these people have not read the feed, and the floor
-- is the higher of the two marks anyway.
-- Guarded, though the column is one statement old and every row is null: this is the statement most
-- likely to be run by hand on an environment that already passed this migration, and doing that
-- unguarded would drag every real watermark back to now and swallow whatever digest was pending.
UPDATE "user_settings" SET "pushed_up_to_activity_id" = (SELECT max("id") FROM "activities")
WHERE "pushed_up_to_activity_id" IS NULL;--> statement-breakpoint
CREATE INDEX "notifications_pushed_at_idx" ON "notifications" USING btree ("pushed_at") WHERE pushed_at is null;--> statement-breakpoint
-- The duplicates the index exists to prevent are already in the table: there was no constraint,
-- so every re-subscribe (a service worker update, a component remount, a subscription refresh)
-- inserted another row for the same device, and that device then received one push per row. Keep
-- the newest row per endpoint, which is the one carrying the current keys.
DELETE FROM "push_subscriptions" a
USING "push_subscriptions" b
WHERE a."endpoint" = b."endpoint" AND a."id" < b."id";--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_endpoint_idx" ON "push_subscriptions" USING btree ("endpoint");