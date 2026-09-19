ALTER TABLE "client_error_logs" ADD COLUMN "alerted_at" timestamp with time zone;--> statement-breakpoint
-- Everything already in the table counts as seen: without this the first cron run after the deploy
-- alerts on the whole retained archive.
UPDATE "client_error_logs" SET "alerted_at" = now() WHERE "alerted_at" IS NULL;
