ALTER TABLE "areas" ADD COLUMN "geo_paths" jsonb;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "area_ids" jsonb;