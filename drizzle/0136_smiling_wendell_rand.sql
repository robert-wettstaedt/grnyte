ALTER TABLE "region_invitations" ADD COLUMN "last_delivered_at" timestamp with time zone;--> statement-breakpoint
-- Every send before this column existed is assumed delivered: there is no record to say otherwise.
UPDATE "region_invitations" SET "last_delivered_at" = "last_sent_at" WHERE "last_sent_at" IS NOT NULL;
