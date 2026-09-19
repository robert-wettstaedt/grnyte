ALTER TABLE "notifications" ADD COLUMN "pushed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "notify_ascents" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "notify_guidebook_edits" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "notify_community" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "notify_directed" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX "notifications_pushed_at_idx" ON "notifications" USING btree ("pushed_at") WHERE pushed_at is null;--> statement-breakpoint
-- The duplicates the index exists to prevent are already in the table: there was no constraint,
-- so every re-subscribe (a service worker update, a component remount, a subscription refresh)
-- inserted another row for the same device, and that device then received one push per row. Keep
-- the newest row per endpoint, which is the one carrying the current keys.
DELETE FROM "push_subscriptions" a
USING "push_subscriptions" b
WHERE a."endpoint" = b."endpoint" AND a."id" < b."id";--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_endpoint_idx" ON "push_subscriptions" USING btree ("endpoint");