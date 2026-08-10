DROP INDEX "activities_notified_idx";--> statement-breakpoint
ALTER TABLE "activities" DROP COLUMN "notified";--> statement-breakpoint
ALTER TABLE "push_subscriptions" DROP COLUMN "lang";--> statement-breakpoint
ALTER TABLE "user_settings" DROP COLUMN "notify_moderations";--> statement-breakpoint
ALTER TABLE "user_settings" DROP COLUMN "notify_new_ascents";--> statement-breakpoint
ALTER TABLE "user_settings" DROP COLUMN "notify_new_users";