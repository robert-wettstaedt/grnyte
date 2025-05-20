ALTER TABLE "activities" ADD COLUMN "region_fk" integer;--> statement-breakpoint
ALTER TABLE "ascents" ADD COLUMN "region_fk" integer;--> statement-breakpoint
ALTER TABLE "bunny_streams" ADD COLUMN "region_fk" integer;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "region_fk" integer;--> statement-breakpoint
ALTER TABLE "geolocations" ADD COLUMN "region_fk" integer;--> statement-breakpoint
ALTER TABLE "routes_to_tags" ADD COLUMN "region_fk" integer;--> statement-breakpoint
ALTER TABLE "topo_routes" ADD COLUMN "region_fk" integer;--> statement-breakpoint
ALTER TABLE "topos" ADD COLUMN "region_fk" integer;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_region_fk_regions_id_fk" FOREIGN KEY ("region_fk") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ascents" ADD CONSTRAINT "ascents_region_fk_regions_id_fk" FOREIGN KEY ("region_fk") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bunny_streams" ADD CONSTRAINT "bunny_streams_region_fk_regions_id_fk" FOREIGN KEY ("region_fk") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_region_fk_regions_id_fk" FOREIGN KEY ("region_fk") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geolocations" ADD CONSTRAINT "geolocations_region_fk_regions_id_fk" FOREIGN KEY ("region_fk") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routes_to_tags" ADD CONSTRAINT "routes_to_tags_region_fk_regions_id_fk" FOREIGN KEY ("region_fk") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topo_routes" ADD CONSTRAINT "topo_routes_region_fk_regions_id_fk" FOREIGN KEY ("region_fk") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topos" ADD CONSTRAINT "topos_region_fk_regions_id_fk" FOREIGN KEY ("region_fk") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activities_region_fk_idx" ON "activities" USING btree ("region_fk");--> statement-breakpoint
CREATE INDEX "ascents_region_fk_idx" ON "ascents" USING btree ("region_fk");--> statement-breakpoint
CREATE INDEX "bunny_streams_region_fk_idx" ON "bunny_streams" USING btree ("region_fk");--> statement-breakpoint
CREATE INDEX "bunny_streams_file_fk_idx" ON "bunny_streams" USING btree ("file_fk");--> statement-breakpoint
CREATE INDEX "files_region_fk_idx" ON "files" USING btree ("region_fk");--> statement-breakpoint
CREATE INDEX "geolocations_region_fk_idx" ON "geolocations" USING btree ("region_fk");--> statement-breakpoint
CREATE INDEX "routes_to_tags_region_fk_idx" ON "routes_to_tags" USING btree ("region_fk");--> statement-breakpoint
CREATE INDEX "routes_to_tags_route_fk_idx" ON "routes_to_tags" USING btree ("route_fk");--> statement-breakpoint
CREATE INDEX "routes_to_tags_tag_fk_idx" ON "routes_to_tags" USING btree ("tag_fk");--> statement-breakpoint
CREATE INDEX "topo_routes_region_fk_idx" ON "topo_routes" USING btree ("region_fk");--> statement-breakpoint
CREATE INDEX "topos_region_fk_idx" ON "topos" USING btree ("region_fk");--> statement-breakpoint
CREATE INDEX "topos_file_fk_idx" ON "topos" USING btree ("file_fk");--> statement-breakpoint
DROP POLICY "data.read can insert activities" ON "activities" CASCADE;--> statement-breakpoint
DROP POLICY "data.read can read activities" ON "activities" CASCADE;--> statement-breakpoint
DROP POLICY "data.delete can delete activities" ON "activities" CASCADE;--> statement-breakpoint
DROP POLICY "data.read can delete their own activities" ON "activities" CASCADE;--> statement-breakpoint
DROP POLICY "data.read can update areas" ON "areas" CASCADE;--> statement-breakpoint
DROP POLICY "data.read can insert ascents" ON "ascents" CASCADE;--> statement-breakpoint
DROP POLICY "data.read can read ascents" ON "ascents" CASCADE;--> statement-breakpoint
DROP POLICY "data.read can update ascents" ON "ascents" CASCADE;--> statement-breakpoint
DROP POLICY "data.read can delete their own ascents" ON "ascents" CASCADE;--> statement-breakpoint
DROP POLICY "data.edit can update ascents" ON "ascents" CASCADE;--> statement-breakpoint
DROP POLICY "data.delete can delete ascents" ON "ascents" CASCADE;--> statement-breakpoint
DROP POLICY "data.read can update blocks" ON "blocks" CASCADE;--> statement-breakpoint
DROP POLICY "data.read can insert bunny_streams" ON "bunny_streams" CASCADE;--> statement-breakpoint
DROP POLICY "data.read can read bunny_streams" ON "bunny_streams" CASCADE;--> statement-breakpoint
DROP POLICY "data.read can update bunny_streams for files of their own ascents" ON "bunny_streams" CASCADE;--> statement-breakpoint
DROP POLICY "data.read can delete bunny_streams for files of their own ascents" ON "bunny_streams" CASCADE;--> statement-breakpoint
DROP POLICY "data.read can insert files" ON "files" CASCADE;--> statement-breakpoint
DROP POLICY "data.read can read files" ON "files" CASCADE;--> statement-breakpoint
DROP POLICY "data.read can update files belonging to their own ascents" ON "files" CASCADE;--> statement-breakpoint
DROP POLICY "data.read can delete files belonging to their own ascents" ON "files" CASCADE;--> statement-breakpoint
DROP POLICY "data.edit can update files" ON "files" CASCADE;--> statement-breakpoint
DROP POLICY "data.edit can delete files" ON "files" CASCADE;--> statement-breakpoint
DROP POLICY "data.read can fully access first_ascensionists" ON "first_ascensionists" CASCADE;--> statement-breakpoint
DROP POLICY "data.read can read geolocations" ON "geolocations" CASCADE;--> statement-breakpoint
DROP POLICY "data.edit can insert geolocations" ON "geolocations" CASCADE;--> statement-breakpoint
DROP POLICY "data.edit can update geolocations" ON "geolocations" CASCADE;--> statement-breakpoint
DROP POLICY "data.delete can delete geolocations" ON "geolocations" CASCADE;--> statement-breakpoint
DROP POLICY "data.read can insert geolocations" ON "geolocations" CASCADE;--> statement-breakpoint
DROP POLICY "authenticated users can fully access grades" ON "grades" CASCADE;--> statement-breakpoint
DROP POLICY "data.edit can delete routes" ON "routes" CASCADE;--> statement-breakpoint
DROP POLICY "data.read can update routes" ON "routes" CASCADE;--> statement-breakpoint
DROP POLICY "data.read can read routes_to_tags" ON "routes_to_tags" CASCADE;--> statement-breakpoint
DROP POLICY "data.edit can insert routes_to_tags" ON "routes_to_tags" CASCADE;--> statement-breakpoint
DROP POLICY "data.edit can update routes_to_tags" ON "routes_to_tags" CASCADE;--> statement-breakpoint
DROP POLICY "data.delete can delete routes_to_tags" ON "routes_to_tags" CASCADE;--> statement-breakpoint
DROP POLICY "data.edit can delete routes_to_tags" ON "routes_to_tags" CASCADE;--> statement-breakpoint
DROP POLICY "data.read can read tags" ON "tags" CASCADE;--> statement-breakpoint
DROP POLICY "data.edit can insert tags" ON "tags" CASCADE;--> statement-breakpoint
DROP POLICY "data.edit can update tags" ON "tags" CASCADE;--> statement-breakpoint
DROP POLICY "data.delete can delete tags" ON "tags" CASCADE;--> statement-breakpoint
DROP POLICY "data.read can read topo_routes" ON "topo_routes" CASCADE;--> statement-breakpoint
DROP POLICY "data.edit can insert topo_routes" ON "topo_routes" CASCADE;--> statement-breakpoint
DROP POLICY "data.edit can update topo_routes" ON "topo_routes" CASCADE;--> statement-breakpoint
DROP POLICY "data.delete can delete topo_routes" ON "topo_routes" CASCADE;--> statement-breakpoint
DROP POLICY "data.edit can delete topo_routes" ON "topo_routes" CASCADE;--> statement-breakpoint
DROP POLICY "data.read can read topos" ON "topos" CASCADE;--> statement-breakpoint
DROP POLICY "data.edit can insert topos" ON "topos" CASCADE;--> statement-breakpoint
DROP POLICY "data.edit can update topos" ON "topos" CASCADE;--> statement-breakpoint
DROP POLICY "data.delete can delete topos" ON "topos" CASCADE;--> statement-breakpoint
DROP POLICY "data.edit can delete topos" ON "topos" CASCADE;--> statement-breakpoint
DROP POLICY "data.read can read users" ON "users" CASCADE;--> statement-breakpoint
CREATE POLICY "data.read can insert activities in region" ON "activities" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT authorize_in_region('data.read', region_fk)));--> statement-breakpoint
CREATE POLICY "data.read can read activities in region" ON "activities" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT authorize_in_region('data.read', region_fk)));--> statement-breakpoint
CREATE POLICY "data.delete can delete activities in region" ON "activities" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT authorize_in_region('data.delete', region_fk)));--> statement-breakpoint
CREATE POLICY "data.read can delete their own activities in region" ON "activities" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
          EXISTS (
            SELECT
              1
            FROM
              public.users u
            WHERE
              u.id = user_fk
              AND u.auth_user_fk = (SELECT auth.uid())
          ) AND EXISTS (SELECT authorize_in_region('data.read', region_fk))
        );--> statement-breakpoint
CREATE POLICY "data.read can update areas in region" ON "areas" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((SELECT authorize_in_region('data.read', region_fk))) WITH CHECK ((SELECT authorize_in_region('data.read', region_fk)));--> statement-breakpoint
CREATE POLICY "data.read can insert ascents in region" ON "ascents" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT authorize_in_region('data.read', region_fk)));--> statement-breakpoint
CREATE POLICY "data.read can read ascents in region" ON "ascents" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT authorize_in_region('data.read', region_fk)));--> statement-breakpoint
CREATE POLICY "data.read can update their ascents in region" ON "ascents" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
          EXISTS (
            SELECT
              1
            FROM
              public.users u
            WHERE
              u.id = created_by
              AND u.auth_user_fk = (SELECT auth.uid())
          ) AND EXISTS (SELECT authorize_in_region('data.read', region_fk))
        ) WITH CHECK (
          EXISTS (
            SELECT
              1
            FROM
              public.users u
            WHERE
              u.id = created_by
              AND u.auth_user_fk = (SELECT auth.uid())
          ) AND EXISTS (SELECT authorize_in_region('data.read', region_fk))
        );--> statement-breakpoint
CREATE POLICY "data.read can delete their own ascents in region" ON "ascents" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
          EXISTS (
            SELECT
              1
            FROM
              public.users u
            WHERE
              u.id = created_by
              AND u.auth_user_fk = (SELECT auth.uid())
          ) AND EXISTS (SELECT authorize_in_region('data.read', region_fk))
        );--> statement-breakpoint
CREATE POLICY "data.edit can update ascents in region" ON "ascents" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((SELECT authorize_in_region('data.edit', region_fk))) WITH CHECK ((SELECT authorize_in_region('data.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "data.delete can delete ascents in region" ON "ascents" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT authorize_in_region('data.delete', region_fk)));--> statement-breakpoint
CREATE POLICY "data.read can update blocks in region" ON "blocks" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((SELECT authorize_in_region('data.read', region_fk))) WITH CHECK ((SELECT authorize_in_region('data.read', region_fk)));--> statement-breakpoint
CREATE POLICY "data.read can insert bunny_streams in region" ON "bunny_streams" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT authorize_in_region('data.read', region_fk)));--> statement-breakpoint
CREATE POLICY "data.read can read bunny_streams in region" ON "bunny_streams" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT authorize_in_region('data.read', region_fk)));--> statement-breakpoint
CREATE POLICY "data.read can update bunny_streams for files of their own ascents in region" ON "bunny_streams" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
          EXISTS (
            SELECT
              1
            FROM
              public.files f
              JOIN public.ascents a ON f.ascent_fk = a.id
              JOIN public.users u ON a.created_by = u.id
            WHERE
              f.id = file_fk
              AND u.auth_user_fk = (SELECT auth.uid())
          ) AND EXISTS (SELECT authorize_in_region('data.read', region_fk))
        ) WITH CHECK (
          EXISTS (
            SELECT
              1
            FROM
              public.files f
              JOIN public.ascents a ON f.ascent_fk = a.id
              JOIN public.users u ON a.created_by = u.id
            WHERE
              f.id = file_fk
              AND u.auth_user_fk = (SELECT auth.uid())
          ) AND EXISTS (SELECT authorize_in_region('data.read', region_fk))
        );--> statement-breakpoint
CREATE POLICY "data.read can delete bunny_streams for files of their own ascents in region" ON "bunny_streams" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
          EXISTS (
            SELECT
              1
            FROM
              public.files f
              JOIN public.ascents a ON f.ascent_fk = a.id
              JOIN public.users u ON a.created_by = u.id
            WHERE
              f.id = file_fk
              AND u.auth_user_fk = (SELECT auth.uid())
          ) AND EXISTS (SELECT authorize_in_region('data.read', region_fk))
        );--> statement-breakpoint
CREATE POLICY "data.read can insert files in region" ON "files" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT authorize_in_region('data.read', region_fk)));--> statement-breakpoint
CREATE POLICY "data.read can read files in region" ON "files" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT authorize_in_region('data.read', region_fk)));--> statement-breakpoint
CREATE POLICY "data.read can update files belonging to their own ascents in region" ON "files" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
          EXISTS (
            SELECT
              1
            FROM
              public.ascents a
              JOIN public.users u ON a.created_by = u.id
            WHERE
              a.id = ascent_fk
              AND u.auth_user_fk = (SELECT auth.uid())
          ) AND EXISTS (SELECT authorize_in_region('data.read', region_fk))
        ) WITH CHECK (
          EXISTS (
            SELECT
              1
            FROM
              public.ascents a
              JOIN public.users u ON a.created_by = u.id
            WHERE
              a.id = ascent_fk
              AND u.auth_user_fk = (SELECT auth.uid())
          ) AND EXISTS (SELECT authorize_in_region('data.read', region_fk))
        );--> statement-breakpoint
CREATE POLICY "data.read can delete files belonging to their own ascents in region" ON "files" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
          EXISTS (
            SELECT
              1
            FROM
              public.ascents a
              JOIN public.users u ON a.created_by = u.id
            WHERE
              a.id = ascent_fk
              AND u.auth_user_fk = (SELECT auth.uid())
          ) AND EXISTS (SELECT authorize_in_region('data.read', region_fk))
        );--> statement-breakpoint
CREATE POLICY "data.edit can update files in region" ON "files" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((SELECT authorize_in_region('data.edit', region_fk))) WITH CHECK ((SELECT authorize_in_region('data.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "data.edit can delete files in region" ON "files" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT authorize_in_region('data.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "data.read can read first_ascensionists in region" ON "first_ascensionists" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT authorize_in_region('data.read', region_fk)));--> statement-breakpoint
CREATE POLICY "data.read can insert first_ascensionists in region" ON "first_ascensionists" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT authorize_in_region('data.read', region_fk)));--> statement-breakpoint
CREATE POLICY "data.read can read geolocations in region" ON "geolocations" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT authorize_in_region('data.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "data.edit can insert geolocations in region" ON "geolocations" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT authorize_in_region('data.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "data.edit can update geolocations in region" ON "geolocations" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((SELECT authorize_in_region('data.edit', region_fk))) WITH CHECK ((SELECT authorize_in_region('data.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "data.delete can delete geolocations in region" ON "geolocations" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT authorize_in_region('data.delete', region_fk)));--> statement-breakpoint
CREATE POLICY "data.read can insert geolocations in region" ON "geolocations" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT authorize_in_region('data.read', region_fk)));--> statement-breakpoint
CREATE POLICY "authenticated users can read grades" ON "grades" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "regions.admin can fully access region_members" ON "region_members" AS PERMISSIVE FOR ALL TO "authenticated" USING ((SELECT authorize_in_region('regions.admin', region_fk))) WITH CHECK ((SELECT authorize_in_region('regions.admin', region_fk)));--> statement-breakpoint
CREATE POLICY "regions.admin can fully access regions" ON "regions" AS PERMISSIVE FOR ALL TO "authenticated" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "data.edit can delete routes in region" ON "routes" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT authorize_in_region('data.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "data.read can update routes in region" ON "routes" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((SELECT authorize_in_region('data.read', region_fk))) WITH CHECK ((SELECT authorize_in_region('data.read', region_fk)));--> statement-breakpoint
CREATE POLICY "data.read can read routes_to_tags in region" ON "routes_to_tags" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT authorize_in_region('data.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "data.edit can insert routes_to_tags in region" ON "routes_to_tags" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT authorize_in_region('data.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "data.edit can update routes_to_tags in region" ON "routes_to_tags" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((SELECT authorize_in_region('data.edit', region_fk))) WITH CHECK ((SELECT authorize_in_region('data.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "data.delete can delete routes_to_tags in region" ON "routes_to_tags" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT authorize_in_region('data.delete', region_fk)));--> statement-breakpoint
CREATE POLICY "data.edit can delete routes_to_tags in region" ON "routes_to_tags" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT authorize_in_region('data.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "authenticated users can read tags" ON "tags" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "tags.admin can fully access tags" ON "tags" AS PERMISSIVE FOR ALL TO "authenticated" USING ((SELECT authorize('tags.admin'))) WITH CHECK ((SELECT authorize('tags.admin')));--> statement-breakpoint
CREATE POLICY "data.read can read topo_routes in region" ON "topo_routes" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT authorize_in_region('data.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "data.edit can insert topo_routes in region" ON "topo_routes" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT authorize_in_region('data.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "data.edit can update topo_routes in region" ON "topo_routes" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((SELECT authorize_in_region('data.edit', region_fk))) WITH CHECK ((SELECT authorize_in_region('data.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "data.delete can delete topo_routes in region" ON "topo_routes" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT authorize_in_region('data.delete', region_fk)));--> statement-breakpoint
CREATE POLICY "data.edit can delete topo_routes in region" ON "topo_routes" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT authorize_in_region('data.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "data.read can read topos in region" ON "topos" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT authorize_in_region('data.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "data.edit can insert topos in region" ON "topos" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT authorize_in_region('data.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "data.edit can update topos in region" ON "topos" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((SELECT authorize_in_region('data.edit', region_fk))) WITH CHECK ((SELECT authorize_in_region('data.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "data.delete can delete topos in region" ON "topos" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT authorize_in_region('data.delete', region_fk)));--> statement-breakpoint
CREATE POLICY "data.edit can delete topos in region" ON "topos" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT authorize_in_region('data.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "authenticated users can read users" ON "users" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
ALTER POLICY "data.read can read areas in region" ON "areas" TO authenticated USING ((SELECT authorize_in_region('data.edit', region_fk)));--> statement-breakpoint
ALTER POLICY "data.edit can insert areas in region" ON "areas" TO authenticated WITH CHECK ((SELECT authorize_in_region('data.edit', region_fk)));--> statement-breakpoint
ALTER POLICY "data.edit can update areas in region" ON "areas" TO authenticated USING ((SELECT authorize_in_region('data.edit', region_fk))) WITH CHECK ((SELECT authorize_in_region('data.edit', region_fk)));--> statement-breakpoint
ALTER POLICY "data.delete can delete areas in region" ON "areas" TO authenticated USING ((SELECT authorize_in_region('data.delete', region_fk)));--> statement-breakpoint
ALTER POLICY "data.read can read blocks in region" ON "blocks" TO authenticated USING ((SELECT authorize_in_region('data.edit', region_fk)));--> statement-breakpoint
ALTER POLICY "data.edit can insert blocks in region" ON "blocks" TO authenticated WITH CHECK ((SELECT authorize_in_region('data.edit', region_fk)));--> statement-breakpoint
ALTER POLICY "data.edit can update blocks in region" ON "blocks" TO authenticated USING ((SELECT authorize_in_region('data.edit', region_fk))) WITH CHECK ((SELECT authorize_in_region('data.edit', region_fk)));--> statement-breakpoint
ALTER POLICY "data.delete can delete blocks in region" ON "blocks" TO authenticated USING ((SELECT authorize_in_region('data.delete', region_fk)));--> statement-breakpoint
ALTER POLICY "data.read can read routes in region" ON "routes" TO authenticated USING ((SELECT authorize_in_region('data.edit', region_fk)));--> statement-breakpoint
ALTER POLICY "data.edit can insert routes in region" ON "routes" TO authenticated WITH CHECK ((SELECT authorize_in_region('data.edit', region_fk)));--> statement-breakpoint
ALTER POLICY "data.edit can update routes in region" ON "routes" TO authenticated USING ((SELECT authorize_in_region('data.edit', region_fk))) WITH CHECK ((SELECT authorize_in_region('data.edit', region_fk)));--> statement-breakpoint
ALTER POLICY "data.delete can delete routes in region" ON "routes" TO authenticated USING ((SELECT authorize_in_region('data.delete', region_fk)));