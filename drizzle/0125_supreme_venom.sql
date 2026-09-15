DROP INDEX IF EXISTS "areas_description_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "ascents_notes_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "routes_description_idx";--> statement-breakpoint
ALTER TABLE "blocks" ADD COLUMN "description" text;