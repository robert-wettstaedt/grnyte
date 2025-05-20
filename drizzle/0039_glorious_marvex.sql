ALTER TYPE "public"."app_permission" ADD VALUE 'regions.admin';--> statement-breakpoint
ALTER TYPE "public"."app_permission" ADD VALUE 'tags.admin';--> statement-breakpoint
ALTER TYPE "public"."app_permission" ADD VALUE 'users.admin';--> statement-breakpoint
CREATE TABLE "region_members" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"region_fk" integer,
	"role" "app_role" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"auth_user_fk" uuid NOT NULL,
	"invited_by" integer,
	"user_fk" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "region_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "regions" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "regions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "region_fk" integer;--> statement-breakpoint
ALTER TABLE "areas" ADD COLUMN "region_fk" integer;--> statement-breakpoint
ALTER TABLE "ascents" ADD COLUMN "region_fk" integer;--> statement-breakpoint
ALTER TABLE "blocks" ADD COLUMN "region_fk" integer;--> statement-breakpoint
ALTER TABLE "bunny_streams" ADD COLUMN "region_fk" integer;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "region_fk" integer;--> statement-breakpoint
ALTER TABLE "first_ascensionists" ADD COLUMN "region_fk" integer;--> statement-breakpoint
ALTER TABLE "geolocations" ADD COLUMN "region_fk" integer;--> statement-breakpoint
ALTER TABLE "route_external_resource_27crags" ADD COLUMN "region_fk" integer;--> statement-breakpoint
ALTER TABLE "route_external_resource_8a" ADD COLUMN "region_fk" integer;--> statement-breakpoint
ALTER TABLE "route_external_resource_the_crag" ADD COLUMN "region_fk" integer;--> statement-breakpoint
ALTER TABLE "route_external_resources" ADD COLUMN "region_fk" integer;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "region_fk" integer;--> statement-breakpoint
ALTER TABLE "routes_to_first_ascensionists" ADD COLUMN "region_fk" integer;--> statement-breakpoint
ALTER TABLE "routes_to_tags" ADD COLUMN "region_fk" integer;--> statement-breakpoint
ALTER TABLE "topo_routes" ADD COLUMN "region_fk" integer;--> statement-breakpoint
ALTER TABLE "topos" ADD COLUMN "region_fk" integer;--> statement-breakpoint
ALTER TABLE "region_members" ADD CONSTRAINT "region_members_region_fk_regions_id_fk" FOREIGN KEY ("region_fk") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "region_members" ADD CONSTRAINT "region_members_auth_user_fk_users_id_fk" FOREIGN KEY ("auth_user_fk") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "region_members" ADD CONSTRAINT "region_members_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "region_members" ADD CONSTRAINT "region_members_user_fk_users_id_fk" FOREIGN KEY ("user_fk") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "region_members_auth_user_fk_idx" ON "region_members" USING btree ("auth_user_fk");--> statement-breakpoint
CREATE INDEX "region_members_region_fk_idx" ON "region_members" USING btree ("region_fk");--> statement-breakpoint
CREATE INDEX "region_members_user_fk_idx" ON "region_members" USING btree ("user_fk");--> statement-breakpoint
CREATE INDEX "regions_name_idx" ON "regions" USING btree ("name");--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_region_fk_regions_id_fk" FOREIGN KEY ("region_fk") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "areas" ADD CONSTRAINT "areas_region_fk_regions_id_fk" FOREIGN KEY ("region_fk") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ascents" ADD CONSTRAINT "ascents_region_fk_regions_id_fk" FOREIGN KEY ("region_fk") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_region_fk_regions_id_fk" FOREIGN KEY ("region_fk") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bunny_streams" ADD CONSTRAINT "bunny_streams_region_fk_regions_id_fk" FOREIGN KEY ("region_fk") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_region_fk_regions_id_fk" FOREIGN KEY ("region_fk") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "first_ascensionists" ADD CONSTRAINT "first_ascensionists_region_fk_regions_id_fk" FOREIGN KEY ("region_fk") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geolocations" ADD CONSTRAINT "geolocations_region_fk_regions_id_fk" FOREIGN KEY ("region_fk") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_external_resource_27crags" ADD CONSTRAINT "route_external_resource_27crags_region_fk_regions_id_fk" FOREIGN KEY ("region_fk") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_external_resource_8a" ADD CONSTRAINT "route_external_resource_8a_region_fk_regions_id_fk" FOREIGN KEY ("region_fk") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_external_resource_the_crag" ADD CONSTRAINT "route_external_resource_the_crag_region_fk_regions_id_fk" FOREIGN KEY ("region_fk") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_external_resources" ADD CONSTRAINT "route_external_resources_region_fk_regions_id_fk" FOREIGN KEY ("region_fk") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routes" ADD CONSTRAINT "routes_region_fk_regions_id_fk" FOREIGN KEY ("region_fk") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routes_to_first_ascensionists" ADD CONSTRAINT "routes_to_first_ascensionists_region_fk_regions_id_fk" FOREIGN KEY ("region_fk") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routes_to_tags" ADD CONSTRAINT "routes_to_tags_region_fk_regions_id_fk" FOREIGN KEY ("region_fk") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topo_routes" ADD CONSTRAINT "topo_routes_region_fk_regions_id_fk" FOREIGN KEY ("region_fk") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topos" ADD CONSTRAINT "topos_region_fk_regions_id_fk" FOREIGN KEY ("region_fk") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "authenticated users can read region_members" ON "region_members" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "users can insert own region_members" ON "region_members" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT auth.uid()) = auth_user_fk);--> statement-breakpoint
CREATE POLICY "users can update own region_members" ON "region_members" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((SELECT auth.uid()) = auth_user_fk) WITH CHECK ((SELECT auth.uid()) = auth_user_fk);--> statement-breakpoint
CREATE POLICY "users can delete own region_members" ON "region_members" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT auth.uid()) = auth_user_fk);--> statement-breakpoint
CREATE POLICY "users can read regions they are members of" ON "regions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
          EXISTS (
            SELECT
              1
            FROM
              region_members as rm
            WHERE
              rm.region_fk = regions.id
              AND rm.auth_user_fk = (SELECT auth.uid())
              AND rm.is_active = true
          )
        );--> statement-breakpoint
CREATE POLICY "regions.admin can fully access regions" ON "regions" AS PERMISSIVE FOR ALL TO "authenticated" USING (true) WITH CHECK (true);