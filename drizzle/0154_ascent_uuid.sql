ALTER TABLE "ascents" ADD COLUMN "uuid" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "ascents" ADD CONSTRAINT "ascents_uuid_unique" UNIQUE("uuid");