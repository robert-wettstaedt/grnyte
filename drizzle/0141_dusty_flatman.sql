ALTER TABLE "events" ADD COLUMN "batch" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "batch_size" integer;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_batch_size_in_batch" CHECK ("events"."batch_size" is null or "events"."batch" is not null);