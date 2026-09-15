DROP INDEX "notifications_pushed_at_idx";--> statement-breakpoint
CREATE INDEX "notifications_pushed_at_idx" ON "notifications" USING btree ("created_at") WHERE pushed_at is null and read_at is null;