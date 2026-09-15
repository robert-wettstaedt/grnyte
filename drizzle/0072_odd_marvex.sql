DROP INDEX "areas_slug_idx";--> statement-breakpoint
DROP INDEX "blocks_slug_idx";--> statement-breakpoint
DROP INDEX "routes_slug_idx";--> statement-breakpoint
ALTER TABLE "areas" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "blocks" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "areas_deleted_at_idx" ON "areas" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "blocks_deleted_at_idx" ON "blocks" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "routes_deleted_at_idx" ON "routes" USING btree ("deleted_at");--> statement-breakpoint
ALTER TABLE "areas" DROP COLUMN "slug";--> statement-breakpoint
ALTER TABLE "areas" DROP COLUMN "visibility";--> statement-breakpoint
ALTER TABLE "blocks" DROP COLUMN "slug";--> statement-breakpoint
ALTER TABLE "routes" DROP COLUMN "slug";