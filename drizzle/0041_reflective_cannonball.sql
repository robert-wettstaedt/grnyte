CREATE INDEX "activities_region_fk_idx" ON "activities" USING btree ("region_fk");--> statement-breakpoint
CREATE INDEX "areas_region_fk_idx" ON "areas" USING btree ("region_fk");--> statement-breakpoint
CREATE INDEX "ascents_region_fk_idx" ON "ascents" USING btree ("region_fk");--> statement-breakpoint
CREATE INDEX "blocks_region_fk_idx" ON "blocks" USING btree ("region_fk");--> statement-breakpoint
CREATE INDEX "bunny_streams_region_fk_idx" ON "bunny_streams" USING btree ("region_fk");--> statement-breakpoint
CREATE INDEX "bunny_streams_file_fk_idx" ON "bunny_streams" USING btree ("file_fk");--> statement-breakpoint
CREATE INDEX "files_region_fk_idx" ON "files" USING btree ("region_fk");--> statement-breakpoint
CREATE INDEX "first_ascensionists_region_fk_idx" ON "first_ascensionists" USING btree ("region_fk");--> statement-breakpoint
CREATE INDEX "geolocations_region_fk_idx" ON "geolocations" USING btree ("region_fk");--> statement-breakpoint
CREATE INDEX "route_external_resources_region_fk_idx" ON "route_external_resources" USING btree ("region_fk");--> statement-breakpoint
CREATE INDEX "routes_region_fk_idx" ON "routes" USING btree ("region_fk");--> statement-breakpoint
CREATE INDEX "routes_to_tags_region_fk_idx" ON "routes_to_tags" USING btree ("region_fk");--> statement-breakpoint
CREATE INDEX "routes_to_tags_route_fk_idx" ON "routes_to_tags" USING btree ("route_fk");--> statement-breakpoint
CREATE INDEX "routes_to_tags_tag_fk_idx" ON "routes_to_tags" USING btree ("tag_fk");--> statement-breakpoint
CREATE INDEX "topo_routes_region_fk_idx" ON "topo_routes" USING btree ("region_fk");--> statement-breakpoint
CREATE INDEX "topos_region_fk_idx" ON "topos" USING btree ("region_fk");--> statement-breakpoint
CREATE INDEX "topos_file_fk_idx" ON "topos" USING btree ("file_fk");--> statement-breakpoint
DROP POLICY "data.read can update ascents" ON "ascents" CASCADE;--> statement-breakpoint
DROP POLICY "data.edit can update ascents" ON "ascents" CASCADE;--> statement-breakpoint
DROP POLICY "data.delete can delete ascents" ON "ascents" CASCADE;--> statement-breakpoint
DROP POLICY "data.edit can update files" ON "files" CASCADE;--> statement-breakpoint
DROP POLICY "data.edit can delete files" ON "files" CASCADE;--> statement-breakpoint
DROP POLICY "authenticated users can fully access grades" ON "grades" CASCADE;--> statement-breakpoint
DROP POLICY "data.read can read tags" ON "tags" CASCADE;--> statement-breakpoint
DROP POLICY "data.edit can insert tags" ON "tags" CASCADE;--> statement-breakpoint
DROP POLICY "data.edit can update tags" ON "tags" CASCADE;--> statement-breakpoint
DROP POLICY "data.delete can delete tags" ON "tags" CASCADE;--> statement-breakpoint
DROP POLICY "data.read can read users" ON "users" CASCADE;--> statement-breakpoint
CREATE POLICY "data.read can update their own ascents" ON "ascents" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
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
CREATE POLICY "region.admin can fully access ascents" ON "ascents" AS PERMISSIVE FOR ALL TO "authenticated" USING ((SELECT authorize_in_region('region.admin', region_fk))) WITH CHECK ((SELECT authorize_in_region('region.admin', region_fk)));--> statement-breakpoint
CREATE POLICY "region.admin can fully access bunny_streams" ON "bunny_streams" AS PERMISSIVE FOR ALL TO "authenticated" USING ((SELECT authorize_in_region('region.admin', region_fk))) WITH CHECK ((SELECT authorize_in_region('region.admin', region_fk)));--> statement-breakpoint
CREATE POLICY "region.admin can fully access files" ON "files" AS PERMISSIVE FOR ALL TO "authenticated" USING ((SELECT authorize_in_region('region.admin', region_fk))) WITH CHECK ((SELECT authorize_in_region('region.admin', region_fk)));--> statement-breakpoint
CREATE POLICY "authenticated users can read grades" ON "grades" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "regions.admin can fully access region_members" ON "region_members" AS PERMISSIVE FOR ALL TO "authenticated" USING ((SELECT authorize_in_region('regions.admin', region_fk))) WITH CHECK ((SELECT authorize_in_region('regions.admin', region_fk)));--> statement-breakpoint
CREATE POLICY "tags.admin can fully access tags" ON "tags" AS PERMISSIVE FOR ALL TO "authenticated" USING ((SELECT authorize('tags.admin'))) WITH CHECK ((SELECT authorize('tags.admin')));--> statement-breakpoint
CREATE POLICY "authenticated users can read tags" ON "tags" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "authenticated users can read users" ON "users" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
ALTER POLICY "data.read can insert activities" ON "activities" TO authenticated WITH CHECK ((SELECT authorize_in_region('data.read', region_fk)));--> statement-breakpoint
ALTER POLICY "data.read can read activities" ON "activities" TO authenticated USING ((SELECT authorize_in_region('data.read', region_fk)));--> statement-breakpoint
ALTER POLICY "data.delete can delete activities" ON "activities" TO authenticated USING ((SELECT authorize_in_region('data.delete', region_fk)));--> statement-breakpoint
ALTER POLICY "data.read can delete their own activities" ON "activities" TO authenticated USING (
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
ALTER POLICY "data.read can read areas" ON "areas" TO authenticated USING ((SELECT authorize_in_region('data.read', region_fk)));--> statement-breakpoint
ALTER POLICY "data.edit can insert areas" ON "areas" TO authenticated WITH CHECK ((SELECT authorize_in_region('data.edit', region_fk)));--> statement-breakpoint
ALTER POLICY "data.edit can update areas" ON "areas" TO authenticated USING ((SELECT authorize_in_region('data.edit', region_fk))) WITH CHECK ((SELECT authorize_in_region('data.edit', region_fk)));--> statement-breakpoint
ALTER POLICY "data.delete can delete areas" ON "areas" TO authenticated USING ((SELECT authorize_in_region('data.delete', region_fk)));--> statement-breakpoint
ALTER POLICY "data.read can update areas" ON "areas" TO authenticated USING ((SELECT authorize_in_region('data.read', region_fk))) WITH CHECK ((SELECT authorize_in_region('data.read', region_fk)));--> statement-breakpoint
ALTER POLICY "data.read can insert ascents" ON "ascents" TO authenticated WITH CHECK ((SELECT authorize_in_region('data.read', region_fk)));--> statement-breakpoint
ALTER POLICY "data.read can read ascents" ON "ascents" TO authenticated USING ((SELECT authorize_in_region('data.read', region_fk)));--> statement-breakpoint
ALTER POLICY "data.read can delete their own ascents" ON "ascents" TO authenticated USING (
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
ALTER POLICY "data.read can read blocks" ON "blocks" TO authenticated USING ((SELECT authorize_in_region('data.read', region_fk)));--> statement-breakpoint
ALTER POLICY "data.edit can insert blocks" ON "blocks" TO authenticated WITH CHECK ((SELECT authorize_in_region('data.edit', region_fk)));--> statement-breakpoint
ALTER POLICY "data.edit can update blocks" ON "blocks" TO authenticated USING ((SELECT authorize_in_region('data.edit', region_fk))) WITH CHECK ((SELECT authorize_in_region('data.edit', region_fk)));--> statement-breakpoint
ALTER POLICY "data.delete can delete blocks" ON "blocks" TO authenticated USING ((SELECT authorize_in_region('data.delete', region_fk)));--> statement-breakpoint
ALTER POLICY "data.read can update blocks" ON "blocks" TO authenticated USING ((SELECT authorize_in_region('data.read', region_fk))) WITH CHECK ((SELECT authorize_in_region('data.read', region_fk)));--> statement-breakpoint
ALTER POLICY "data.read can insert bunny_streams" ON "bunny_streams" TO authenticated WITH CHECK ((SELECT authorize_in_region('data.read', region_fk)));--> statement-breakpoint
ALTER POLICY "data.read can read bunny_streams" ON "bunny_streams" TO authenticated USING ((SELECT authorize_in_region('data.read', region_fk)));--> statement-breakpoint
ALTER POLICY "data.read can update bunny_streams for files of their own ascents" ON "bunny_streams" TO authenticated USING (
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
ALTER POLICY "data.read can delete bunny_streams for files of their own ascents" ON "bunny_streams" TO authenticated USING (
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
ALTER POLICY "data.read can insert files" ON "files" TO authenticated WITH CHECK ((SELECT authorize_in_region('data.read', region_fk)));--> statement-breakpoint
ALTER POLICY "data.read can read files" ON "files" TO authenticated USING ((SELECT authorize_in_region('data.read', region_fk)));--> statement-breakpoint
ALTER POLICY "data.read can update files belonging to their own ascents" ON "files" TO authenticated USING (
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
ALTER POLICY "data.read can delete files belonging to their own ascents" ON "files" TO authenticated USING (
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
ALTER POLICY "data.read can fully access first_ascensionists" ON "first_ascensionists" TO authenticated USING ((SELECT authorize_in_region('data.read', region_fk))) WITH CHECK ((SELECT authorize_in_region('data.read', region_fk)));--> statement-breakpoint
ALTER POLICY "data.read can read geolocations" ON "geolocations" TO authenticated USING ((SELECT authorize_in_region('data.read', region_fk)));--> statement-breakpoint
ALTER POLICY "data.edit can insert geolocations" ON "geolocations" TO authenticated WITH CHECK ((SELECT authorize_in_region('data.edit', region_fk)));--> statement-breakpoint
ALTER POLICY "data.edit can update geolocations" ON "geolocations" TO authenticated USING ((SELECT authorize_in_region('data.edit', region_fk))) WITH CHECK ((SELECT authorize_in_region('data.edit', region_fk)));--> statement-breakpoint
ALTER POLICY "data.delete can delete geolocations" ON "geolocations" TO authenticated USING ((SELECT authorize_in_region('data.delete', region_fk)));--> statement-breakpoint
ALTER POLICY "data.read can insert geolocations" ON "geolocations" TO authenticated WITH CHECK ((SELECT authorize_in_region('data.read', region_fk)));--> statement-breakpoint
ALTER POLICY "data.read can read route_external_resource_27crags" ON "route_external_resource_27crags" TO authenticated USING ((SELECT authorize_in_region('data.read', region_fk)));--> statement-breakpoint
ALTER POLICY "data.edit can insert route_external_resource_27crags" ON "route_external_resource_27crags" TO authenticated WITH CHECK ((SELECT authorize_in_region('data.edit', region_fk)));--> statement-breakpoint
ALTER POLICY "data.edit can update route_external_resource_27crags" ON "route_external_resource_27crags" TO authenticated USING ((SELECT authorize_in_region('data.edit', region_fk))) WITH CHECK ((SELECT authorize_in_region('data.edit', region_fk)));--> statement-breakpoint
ALTER POLICY "data.delete can delete route_external_resource_27crags" ON "route_external_resource_27crags" TO authenticated USING ((SELECT authorize_in_region('data.delete', region_fk)));--> statement-breakpoint
ALTER POLICY "data.read can read route_external_resource_8a" ON "route_external_resource_8a" TO authenticated USING ((SELECT authorize_in_region('data.read', region_fk)));--> statement-breakpoint
ALTER POLICY "data.edit can insert route_external_resource_8a" ON "route_external_resource_8a" TO authenticated WITH CHECK ((SELECT authorize_in_region('data.edit', region_fk)));--> statement-breakpoint
ALTER POLICY "data.edit can update route_external_resource_8a" ON "route_external_resource_8a" TO authenticated USING ((SELECT authorize_in_region('data.edit', region_fk))) WITH CHECK ((SELECT authorize_in_region('data.edit', region_fk)));--> statement-breakpoint
ALTER POLICY "data.delete can delete route_external_resource_8a" ON "route_external_resource_8a" TO authenticated USING ((SELECT authorize_in_region('data.delete', region_fk)));--> statement-breakpoint
ALTER POLICY "data.read can read route_external_resource_the_crag" ON "route_external_resource_the_crag" TO authenticated USING ((SELECT authorize_in_region('data.read', region_fk)));--> statement-breakpoint
ALTER POLICY "data.edit can insert route_external_resource_the_crag" ON "route_external_resource_the_crag" TO authenticated WITH CHECK ((SELECT authorize_in_region('data.edit', region_fk)));--> statement-breakpoint
ALTER POLICY "data.edit can update route_external_resource_the_crag" ON "route_external_resource_the_crag" TO authenticated USING ((SELECT authorize_in_region('data.edit', region_fk))) WITH CHECK ((SELECT authorize_in_region('data.edit', region_fk)));--> statement-breakpoint
ALTER POLICY "data.delete can delete route_external_resource_the_crag" ON "route_external_resource_the_crag" TO authenticated USING ((SELECT authorize_in_region('data.delete', region_fk)));--> statement-breakpoint
ALTER POLICY "data.read can read route_external_resources" ON "route_external_resources" TO authenticated USING ((SELECT authorize_in_region('data.read', region_fk)));--> statement-breakpoint
ALTER POLICY "data.edit can insert route_external_resources" ON "route_external_resources" TO authenticated WITH CHECK ((SELECT authorize_in_region('data.edit', region_fk)));--> statement-breakpoint
ALTER POLICY "data.edit can update route_external_resources" ON "route_external_resources" TO authenticated USING ((SELECT authorize_in_region('data.edit', region_fk))) WITH CHECK ((SELECT authorize_in_region('data.edit', region_fk)));--> statement-breakpoint
ALTER POLICY "data.delete can delete route_external_resources" ON "route_external_resources" TO authenticated USING ((SELECT authorize_in_region('data.delete', region_fk)));--> statement-breakpoint
ALTER POLICY "data.read can read routes" ON "routes" TO authenticated USING ((SELECT authorize_in_region('data.read', region_fk)));--> statement-breakpoint
ALTER POLICY "data.edit can insert routes" ON "routes" TO authenticated WITH CHECK ((SELECT authorize_in_region('data.edit', region_fk)));--> statement-breakpoint
ALTER POLICY "data.edit can update routes" ON "routes" TO authenticated USING ((SELECT authorize_in_region('data.edit', region_fk))) WITH CHECK ((SELECT authorize_in_region('data.edit', region_fk)));--> statement-breakpoint
ALTER POLICY "data.delete can delete routes" ON "routes" TO authenticated USING ((SELECT authorize_in_region('data.delete', region_fk)));--> statement-breakpoint
ALTER POLICY "data.read can update routes" ON "routes" TO authenticated USING ((SELECT authorize_in_region('data.read', region_fk))) WITH CHECK ((SELECT authorize_in_region('data.read', region_fk)));--> statement-breakpoint
ALTER POLICY "data.edit can delete routes" ON "routes" TO authenticated USING ((SELECT authorize_in_region('data.edit', region_fk)));--> statement-breakpoint
ALTER POLICY "data.read can fully access routes_to_first_ascensionists" ON "routes_to_first_ascensionists" TO authenticated USING ((SELECT authorize_in_region('data.read', region_fk))) WITH CHECK ((SELECT authorize_in_region('data.read', region_fk)));--> statement-breakpoint
ALTER POLICY "data.read can read routes_to_tags" ON "routes_to_tags" TO authenticated USING ((SELECT authorize_in_region('data.read', region_fk)));--> statement-breakpoint
ALTER POLICY "data.edit can insert routes_to_tags" ON "routes_to_tags" TO authenticated WITH CHECK ((SELECT authorize_in_region('data.edit', region_fk)));--> statement-breakpoint
ALTER POLICY "data.edit can update routes_to_tags" ON "routes_to_tags" TO authenticated USING ((SELECT authorize_in_region('data.edit', region_fk))) WITH CHECK ((SELECT authorize_in_region('data.edit', region_fk)));--> statement-breakpoint
ALTER POLICY "data.delete can delete routes_to_tags" ON "routes_to_tags" TO authenticated USING ((SELECT authorize_in_region('data.delete', region_fk)));--> statement-breakpoint
ALTER POLICY "data.edit can delete routes_to_tags" ON "routes_to_tags" TO authenticated USING ((SELECT authorize_in_region('data.edit', region_fk)));--> statement-breakpoint
ALTER POLICY "data.read can read topo_routes" ON "topo_routes" TO authenticated USING ((SELECT authorize_in_region('data.read', region_fk)));--> statement-breakpoint
ALTER POLICY "data.edit can insert topo_routes" ON "topo_routes" TO authenticated WITH CHECK ((SELECT authorize_in_region('data.edit', region_fk)));--> statement-breakpoint
ALTER POLICY "data.edit can update topo_routes" ON "topo_routes" TO authenticated USING ((SELECT authorize_in_region('data.edit', region_fk))) WITH CHECK ((SELECT authorize_in_region('data.edit', region_fk)));--> statement-breakpoint
ALTER POLICY "data.delete can delete topo_routes" ON "topo_routes" TO authenticated USING ((SELECT authorize_in_region('data.delete', region_fk)));--> statement-breakpoint
ALTER POLICY "data.edit can delete topo_routes" ON "topo_routes" TO authenticated USING ((SELECT authorize_in_region('data.edit', region_fk)));--> statement-breakpoint
ALTER POLICY "data.read can read topos" ON "topos" TO authenticated USING ((SELECT authorize_in_region('data.read', region_fk)));--> statement-breakpoint
ALTER POLICY "data.edit can insert topos" ON "topos" TO authenticated WITH CHECK ((SELECT authorize_in_region('data.edit', region_fk)));--> statement-breakpoint
ALTER POLICY "data.edit can update topos" ON "topos" TO authenticated USING ((SELECT authorize_in_region('data.edit', region_fk))) WITH CHECK ((SELECT authorize_in_region('data.edit', region_fk)));--> statement-breakpoint
ALTER POLICY "data.delete can delete topos" ON "topos" TO authenticated USING ((SELECT authorize_in_region('data.delete', region_fk)));--> statement-breakpoint
ALTER POLICY "data.edit can delete topos" ON "topos" TO authenticated USING ((SELECT authorize_in_region('data.edit', region_fk)));