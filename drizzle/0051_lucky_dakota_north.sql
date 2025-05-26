ALTER TABLE "activities" ALTER COLUMN "region_fk" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "areas" ALTER COLUMN "region_fk" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ascents" ALTER COLUMN "region_fk" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "blocks" ALTER COLUMN "region_fk" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "bunny_streams" ALTER COLUMN "region_fk" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "files" ALTER COLUMN "region_fk" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "first_ascensionists" ALTER COLUMN "region_fk" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "geolocations" ALTER COLUMN "region_fk" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "region_members" ALTER COLUMN "region_fk" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "route_external_resource_27crags" ALTER COLUMN "region_fk" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "route_external_resource_8a" ALTER COLUMN "region_fk" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "route_external_resource_the_crag" ALTER COLUMN "region_fk" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "route_external_resources" ALTER COLUMN "region_fk" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "routes" ALTER COLUMN "region_fk" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "routes_to_first_ascensionists" ALTER COLUMN "region_fk" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "routes_to_tags" ALTER COLUMN "region_fk" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "topo_routes" ALTER COLUMN "region_fk" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "topos" ALTER COLUMN "region_fk" SET NOT NULL;