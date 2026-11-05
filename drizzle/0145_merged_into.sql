ALTER TABLE "areas" ADD COLUMN "merged_into" integer;--> statement-breakpoint
ALTER TABLE "blocks" ADD COLUMN "merged_into" integer;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "merged_into" integer;--> statement-breakpoint
ALTER TABLE "areas" ADD CONSTRAINT "areas_merged_into_areas_id_fk" FOREIGN KEY ("merged_into") REFERENCES "public"."areas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_merged_into_blocks_id_fk" FOREIGN KEY ("merged_into") REFERENCES "public"."blocks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routes" ADD CONSTRAINT "routes_merged_into_routes_id_fk" FOREIGN KEY ("merged_into") REFERENCES "public"."routes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "areas" ADD CONSTRAINT "areas_merged_is_deleted" CHECK ("areas"."merged_into" is null or "areas"."deleted_at" is not null);--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_merged_is_deleted" CHECK ("blocks"."merged_into" is null or "blocks"."deleted_at" is not null);--> statement-breakpoint
ALTER TABLE "routes" ADD CONSTRAINT "routes_merged_is_deleted" CHECK ("routes"."merged_into" is null or "routes"."deleted_at" is not null);