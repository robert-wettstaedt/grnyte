DROP POLICY "data.read can insert activities" ON "activities" CASCADE;--> statement-breakpoint
DROP POLICY "data.read can read activities" ON "activities" CASCADE;--> statement-breakpoint
DROP POLICY "data.delete can delete activities" ON "activities" CASCADE;--> statement-breakpoint
DROP POLICY "data.read can delete their own activities" ON "activities" CASCADE;--> statement-breakpoint
DROP POLICY "data.read can read areas" ON "areas" CASCADE;--> statement-breakpoint
DROP POLICY "data.edit can insert areas" ON "areas" CASCADE;--> statement-breakpoint
DROP POLICY "data.edit can update areas" ON "areas" CASCADE;--> statement-breakpoint
DROP POLICY "data.delete can delete areas" ON "areas" CASCADE;--> statement-breakpoint
DROP POLICY "data.read can update areas" ON "areas" CASCADE;--> statement-breakpoint
DROP POLICY "data.read can insert ascents" ON "ascents" CASCADE;--> statement-breakpoint
DROP POLICY "data.read can read ascents" ON "ascents" CASCADE;--> statement-breakpoint
DROP POLICY "data.read can update their own ascents" ON "ascents" CASCADE;--> statement-breakpoint
DROP POLICY "data.read can delete their own ascents" ON "ascents" CASCADE;--> statement-breakpoint
DROP POLICY "data.read can read blocks" ON "blocks" CASCADE;--> statement-breakpoint
DROP POLICY "data.edit can insert blocks" ON "blocks" CASCADE;--> statement-breakpoint
DROP POLICY "data.edit can update blocks" ON "blocks" CASCADE;--> statement-breakpoint
DROP POLICY "data.delete can delete blocks" ON "blocks" CASCADE;--> statement-breakpoint
DROP POLICY "data.read can update blocks" ON "blocks" CASCADE;--> statement-breakpoint
DROP POLICY "data.read can insert bunny_streams" ON "bunny_streams" CASCADE;--> statement-breakpoint
DROP POLICY "data.read can read bunny_streams" ON "bunny_streams" CASCADE;--> statement-breakpoint
DROP POLICY "data.read can update bunny_streams for files of their own ascents" ON "bunny_streams" CASCADE;--> statement-breakpoint
DROP POLICY "data.read can delete bunny_streams for files of their own ascents" ON "bunny_streams" CASCADE;--> statement-breakpoint
DROP POLICY "data.read can insert files" ON "files" CASCADE;--> statement-breakpoint
DROP POLICY "data.read can read files" ON "files" CASCADE;--> statement-breakpoint
DROP POLICY "data.read can update files belonging to their own ascents" ON "files" CASCADE;--> statement-breakpoint
DROP POLICY "data.read can delete files belonging to their own ascents" ON "files" CASCADE;--> statement-breakpoint
DROP POLICY "data.read can fully access first_ascensionists" ON "first_ascensionists" CASCADE;--> statement-breakpoint
DROP POLICY "data.read can read geolocations" ON "geolocations" CASCADE;--> statement-breakpoint
DROP POLICY "data.edit can insert geolocations" ON "geolocations" CASCADE;--> statement-breakpoint
DROP POLICY "data.edit can update geolocations" ON "geolocations" CASCADE;--> statement-breakpoint
DROP POLICY "data.delete can delete geolocations" ON "geolocations" CASCADE;--> statement-breakpoint
DROP POLICY "data.read can insert geolocations" ON "geolocations" CASCADE;--> statement-breakpoint
DROP POLICY "regions.admin can fully access region_members" ON "region_members" CASCADE;--> statement-breakpoint
DROP POLICY "regions.admin can fully access regions" ON "regions" CASCADE;--> statement-breakpoint
DROP POLICY "data.read can read route_external_resource_27crags" ON "route_external_resource_27crags" CASCADE;--> statement-breakpoint
DROP POLICY "data.edit can insert route_external_resource_27crags" ON "route_external_resource_27crags" CASCADE;--> statement-breakpoint
DROP POLICY "data.edit can update route_external_resource_27crags" ON "route_external_resource_27crags" CASCADE;--> statement-breakpoint
DROP POLICY "data.delete can delete route_external_resource_27crags" ON "route_external_resource_27crags" CASCADE;--> statement-breakpoint
DROP POLICY "data.read can read route_external_resource_8a" ON "route_external_resource_8a" CASCADE;--> statement-breakpoint
DROP POLICY "data.edit can insert route_external_resource_8a" ON "route_external_resource_8a" CASCADE;--> statement-breakpoint
DROP POLICY "data.edit can update route_external_resource_8a" ON "route_external_resource_8a" CASCADE;--> statement-breakpoint
DROP POLICY "data.delete can delete route_external_resource_8a" ON "route_external_resource_8a" CASCADE;--> statement-breakpoint
DROP POLICY "data.read can read route_external_resource_the_crag" ON "route_external_resource_the_crag" CASCADE;--> statement-breakpoint
DROP POLICY "data.edit can insert route_external_resource_the_crag" ON "route_external_resource_the_crag" CASCADE;--> statement-breakpoint
DROP POLICY "data.edit can update route_external_resource_the_crag" ON "route_external_resource_the_crag" CASCADE;--> statement-breakpoint
DROP POLICY "data.delete can delete route_external_resource_the_crag" ON "route_external_resource_the_crag" CASCADE;--> statement-breakpoint
DROP POLICY "data.read can read route_external_resources" ON "route_external_resources" CASCADE;--> statement-breakpoint
DROP POLICY "data.edit can insert route_external_resources" ON "route_external_resources" CASCADE;--> statement-breakpoint
DROP POLICY "data.edit can update route_external_resources" ON "route_external_resources" CASCADE;--> statement-breakpoint
DROP POLICY "data.delete can delete route_external_resources" ON "route_external_resources" CASCADE;--> statement-breakpoint
DROP POLICY "data.read can read routes" ON "routes" CASCADE;--> statement-breakpoint
DROP POLICY "data.edit can insert routes" ON "routes" CASCADE;--> statement-breakpoint
DROP POLICY "data.edit can update routes" ON "routes" CASCADE;--> statement-breakpoint
DROP POLICY "data.delete can delete routes" ON "routes" CASCADE;--> statement-breakpoint
DROP POLICY "data.edit can delete routes" ON "routes" CASCADE;--> statement-breakpoint
DROP POLICY "data.read can update routes" ON "routes" CASCADE;--> statement-breakpoint
DROP POLICY "data.read can fully access routes_to_first_ascensionists" ON "routes_to_first_ascensionists" CASCADE;--> statement-breakpoint
DROP POLICY "data.read can read routes_to_tags" ON "routes_to_tags" CASCADE;--> statement-breakpoint
DROP POLICY "data.edit can insert routes_to_tags" ON "routes_to_tags" CASCADE;--> statement-breakpoint
DROP POLICY "data.edit can update routes_to_tags" ON "routes_to_tags" CASCADE;--> statement-breakpoint
DROP POLICY "data.delete can delete routes_to_tags" ON "routes_to_tags" CASCADE;--> statement-breakpoint
DROP POLICY "data.edit can delete routes_to_tags" ON "routes_to_tags" CASCADE;--> statement-breakpoint
DROP POLICY "tags.admin can fully access tags" ON "tags" CASCADE;--> statement-breakpoint
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
CREATE POLICY "region.read can insert activities" ON "activities" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT authorize_in_region('region.read', region_fk)));--> statement-breakpoint
CREATE POLICY "region.read can read activities" ON "activities" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT authorize_in_region('region.read', region_fk)));--> statement-breakpoint
CREATE POLICY "region.delete can delete activities" ON "activities" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT authorize_in_region('region.delete', region_fk)));--> statement-breakpoint
CREATE POLICY "region.read can delete their own activities" ON "activities" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
          EXISTS (
            SELECT
              1
            FROM
              public.users u
            WHERE
              u.id = user_fk
              AND u.auth_user_fk = (SELECT auth.uid())
          ) AND EXISTS (SELECT authorize_in_region('region.read', region_fk))
        );--> statement-breakpoint
CREATE POLICY "region.read can read areas" ON "areas" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT authorize_in_region('region.read', region_fk)));--> statement-breakpoint
CREATE POLICY "region.edit can insert areas" ON "areas" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT authorize_in_region('region.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "region.edit can update areas" ON "areas" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((SELECT authorize_in_region('region.edit', region_fk))) WITH CHECK ((SELECT authorize_in_region('region.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "region.delete can delete areas" ON "areas" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT authorize_in_region('region.delete', region_fk)));--> statement-breakpoint
CREATE POLICY "region.read can update areas" ON "areas" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((SELECT authorize_in_region('region.read', region_fk))) WITH CHECK ((SELECT authorize_in_region('region.read', region_fk)));--> statement-breakpoint
CREATE POLICY "region.read can insert ascents" ON "ascents" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT authorize_in_region('region.read', region_fk)));--> statement-breakpoint
CREATE POLICY "region.read can read ascents" ON "ascents" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT authorize_in_region('region.read', region_fk)));--> statement-breakpoint
CREATE POLICY "region.read can update their own ascents" ON "ascents" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
          EXISTS (
            SELECT
              1
            FROM
              public.users u
            WHERE
              u.id = created_by
              AND u.auth_user_fk = (SELECT auth.uid())
          ) AND EXISTS (SELECT authorize_in_region('region.read', region_fk))
        ) WITH CHECK (
          EXISTS (
            SELECT
              1
            FROM
              public.users u
            WHERE
              u.id = created_by
              AND u.auth_user_fk = (SELECT auth.uid())
          ) AND EXISTS (SELECT authorize_in_region('region.read', region_fk))
        );--> statement-breakpoint
CREATE POLICY "region.read can delete their own ascents" ON "ascents" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
          EXISTS (
            SELECT
              1
            FROM
              public.users u
            WHERE
              u.id = created_by
              AND u.auth_user_fk = (SELECT auth.uid())
          ) AND EXISTS (SELECT authorize_in_region('region.read', region_fk))
        );--> statement-breakpoint
CREATE POLICY "region.read can read blocks" ON "blocks" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT authorize_in_region('region.read', region_fk)));--> statement-breakpoint
CREATE POLICY "region.edit can insert blocks" ON "blocks" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT authorize_in_region('region.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "region.edit can update blocks" ON "blocks" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((SELECT authorize_in_region('region.edit', region_fk))) WITH CHECK ((SELECT authorize_in_region('region.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "region.delete can delete blocks" ON "blocks" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT authorize_in_region('region.delete', region_fk)));--> statement-breakpoint
CREATE POLICY "region.read can update blocks" ON "blocks" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((SELECT authorize_in_region('region.read', region_fk))) WITH CHECK ((SELECT authorize_in_region('region.read', region_fk)));--> statement-breakpoint
CREATE POLICY "region.read can insert bunny_streams" ON "bunny_streams" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT authorize_in_region('region.read', region_fk)));--> statement-breakpoint
CREATE POLICY "region.read can read bunny_streams" ON "bunny_streams" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT authorize_in_region('region.read', region_fk)));--> statement-breakpoint
CREATE POLICY "region.read can update bunny_streams for files of their own ascents" ON "bunny_streams" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
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
          ) AND EXISTS (SELECT authorize_in_region('region.read', region_fk))
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
          ) AND EXISTS (SELECT authorize_in_region('region.read', region_fk))
        );--> statement-breakpoint
CREATE POLICY "region.read can delete bunny_streams for files of their own ascents" ON "bunny_streams" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
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
          ) AND EXISTS (SELECT authorize_in_region('region.read', region_fk))
        );--> statement-breakpoint
CREATE POLICY "region.read can insert files" ON "files" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT authorize_in_region('region.read', region_fk)));--> statement-breakpoint
CREATE POLICY "region.read can read files" ON "files" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT authorize_in_region('region.read', region_fk)));--> statement-breakpoint
CREATE POLICY "region.read can update files belonging to their own ascents" ON "files" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
          EXISTS (
            SELECT
              1
            FROM
              public.ascents a
              JOIN public.users u ON a.created_by = u.id
            WHERE
              a.id = ascent_fk
              AND u.auth_user_fk = (SELECT auth.uid())
          ) AND EXISTS (SELECT authorize_in_region('region.read', region_fk))
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
          ) AND EXISTS (SELECT authorize_in_region('region.read', region_fk))
        );--> statement-breakpoint
CREATE POLICY "region.read can delete files belonging to their own ascents" ON "files" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
          EXISTS (
            SELECT
              1
            FROM
              public.ascents a
              JOIN public.users u ON a.created_by = u.id
            WHERE
              a.id = ascent_fk
              AND u.auth_user_fk = (SELECT auth.uid())
          ) AND EXISTS (SELECT authorize_in_region('region.read', region_fk))
        );--> statement-breakpoint
CREATE POLICY "region.read can fully access first_ascensionists" ON "first_ascensionists" AS PERMISSIVE FOR ALL TO "authenticated" USING ((SELECT authorize_in_region('region.read', region_fk))) WITH CHECK ((SELECT authorize_in_region('region.read', region_fk)));--> statement-breakpoint
CREATE POLICY "region.read can read geolocations" ON "geolocations" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT authorize_in_region('region.read', region_fk)));--> statement-breakpoint
CREATE POLICY "region.edit can insert geolocations" ON "geolocations" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT authorize_in_region('region.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "region.edit can update geolocations" ON "geolocations" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((SELECT authorize_in_region('region.edit', region_fk))) WITH CHECK ((SELECT authorize_in_region('region.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "region.delete can delete geolocations" ON "geolocations" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT authorize_in_region('region.delete', region_fk)));--> statement-breakpoint
CREATE POLICY "region.read can insert geolocations" ON "geolocations" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT authorize_in_region('region.read', region_fk)));--> statement-breakpoint
CREATE POLICY "app.admin can fully access region_members" ON "region_members" AS PERMISSIVE FOR ALL TO "authenticated" USING ((SELECT authorize_in_region('app.admin', region_fk))) WITH CHECK ((SELECT authorize_in_region('app.admin', region_fk)));--> statement-breakpoint
CREATE POLICY "app.admin can fully access regions" ON "regions" AS PERMISSIVE FOR ALL TO "authenticated" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "region.read can read route_external_resource_27crags" ON "route_external_resource_27crags" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT authorize_in_region('region.read', region_fk)));--> statement-breakpoint
CREATE POLICY "region.edit can insert route_external_resource_27crags" ON "route_external_resource_27crags" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT authorize_in_region('region.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "region.edit can update route_external_resource_27crags" ON "route_external_resource_27crags" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((SELECT authorize_in_region('region.edit', region_fk))) WITH CHECK ((SELECT authorize_in_region('region.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "region.delete can delete route_external_resource_27crags" ON "route_external_resource_27crags" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT authorize_in_region('region.delete', region_fk)));--> statement-breakpoint
CREATE POLICY "region.read can read route_external_resource_8a" ON "route_external_resource_8a" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT authorize_in_region('region.read', region_fk)));--> statement-breakpoint
CREATE POLICY "region.edit can insert route_external_resource_8a" ON "route_external_resource_8a" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT authorize_in_region('region.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "region.edit can update route_external_resource_8a" ON "route_external_resource_8a" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((SELECT authorize_in_region('region.edit', region_fk))) WITH CHECK ((SELECT authorize_in_region('region.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "region.delete can delete route_external_resource_8a" ON "route_external_resource_8a" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT authorize_in_region('region.delete', region_fk)));--> statement-breakpoint
CREATE POLICY "region.read can read route_external_resource_the_crag" ON "route_external_resource_the_crag" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT authorize_in_region('region.read', region_fk)));--> statement-breakpoint
CREATE POLICY "region.edit can insert route_external_resource_the_crag" ON "route_external_resource_the_crag" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT authorize_in_region('region.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "region.edit can update route_external_resource_the_crag" ON "route_external_resource_the_crag" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((SELECT authorize_in_region('region.edit', region_fk))) WITH CHECK ((SELECT authorize_in_region('region.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "region.delete can delete route_external_resource_the_crag" ON "route_external_resource_the_crag" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT authorize_in_region('region.delete', region_fk)));--> statement-breakpoint
CREATE POLICY "region.read can read route_external_resources" ON "route_external_resources" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT authorize_in_region('region.read', region_fk)));--> statement-breakpoint
CREATE POLICY "region.edit can insert route_external_resources" ON "route_external_resources" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT authorize_in_region('region.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "region.edit can update route_external_resources" ON "route_external_resources" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((SELECT authorize_in_region('region.edit', region_fk))) WITH CHECK ((SELECT authorize_in_region('region.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "region.delete can delete route_external_resources" ON "route_external_resources" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT authorize_in_region('region.delete', region_fk)));--> statement-breakpoint
CREATE POLICY "region.read can read routes" ON "routes" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT authorize_in_region('region.read', region_fk)));--> statement-breakpoint
CREATE POLICY "region.edit can insert routes" ON "routes" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT authorize_in_region('region.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "region.edit can update routes" ON "routes" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((SELECT authorize_in_region('region.edit', region_fk))) WITH CHECK ((SELECT authorize_in_region('region.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "region.delete can delete routes" ON "routes" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT authorize_in_region('region.delete', region_fk)));--> statement-breakpoint
CREATE POLICY "region.edit can delete routes" ON "routes" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT authorize_in_region('region.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "region.read can update routes" ON "routes" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((SELECT authorize_in_region('region.read', region_fk))) WITH CHECK ((SELECT authorize_in_region('region.read', region_fk)));--> statement-breakpoint
CREATE POLICY "region.read can fully access routes_to_first_ascensionists" ON "routes_to_first_ascensionists" AS PERMISSIVE FOR ALL TO "authenticated" USING ((SELECT authorize_in_region('region.read', region_fk))) WITH CHECK ((SELECT authorize_in_region('region.read', region_fk)));--> statement-breakpoint
CREATE POLICY "region.read can read routes_to_tags" ON "routes_to_tags" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT authorize_in_region('region.read', region_fk)));--> statement-breakpoint
CREATE POLICY "region.edit can insert routes_to_tags" ON "routes_to_tags" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT authorize_in_region('region.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "region.edit can update routes_to_tags" ON "routes_to_tags" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((SELECT authorize_in_region('region.edit', region_fk))) WITH CHECK ((SELECT authorize_in_region('region.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "region.delete can delete routes_to_tags" ON "routes_to_tags" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT authorize_in_region('region.delete', region_fk)));--> statement-breakpoint
CREATE POLICY "region.edit can delete routes_to_tags" ON "routes_to_tags" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT authorize_in_region('region.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "app.admin can fully access tags" ON "tags" AS PERMISSIVE FOR ALL TO "authenticated" USING ((SELECT authorize('app.admin'))) WITH CHECK ((SELECT authorize('app.admin')));--> statement-breakpoint
CREATE POLICY "region.read can read topo_routes" ON "topo_routes" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT authorize_in_region('region.read', region_fk)));--> statement-breakpoint
CREATE POLICY "region.edit can insert topo_routes" ON "topo_routes" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT authorize_in_region('region.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "region.edit can update topo_routes" ON "topo_routes" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((SELECT authorize_in_region('region.edit', region_fk))) WITH CHECK ((SELECT authorize_in_region('region.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "region.delete can delete topo_routes" ON "topo_routes" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT authorize_in_region('region.delete', region_fk)));--> statement-breakpoint
CREATE POLICY "region.edit can delete topo_routes" ON "topo_routes" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT authorize_in_region('region.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "region.read can read topos" ON "topos" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT authorize_in_region('region.read', region_fk)));--> statement-breakpoint
CREATE POLICY "region.edit can insert topos" ON "topos" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT authorize_in_region('region.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "region.edit can update topos" ON "topos" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((SELECT authorize_in_region('region.edit', region_fk))) WITH CHECK ((SELECT authorize_in_region('region.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "region.delete can delete topos" ON "topos" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT authorize_in_region('region.delete', region_fk)));--> statement-breakpoint
CREATE POLICY "region.edit can delete topos" ON "topos" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT authorize_in_region('region.edit', region_fk)));--> statement-breakpoint
ALTER POLICY "region.admin can fully access ascents" ON "ascents" TO authenticated USING ((SELECT authorize_in_region('region.admin', region_fk))) WITH CHECK ((SELECT authorize_in_region('region.admin', region_fk)));--> statement-breakpoint
ALTER POLICY "region.admin can fully access bunny_streams" ON "bunny_streams" TO authenticated USING ((SELECT authorize_in_region('region.admin', region_fk))) WITH CHECK ((SELECT authorize_in_region('region.admin', region_fk)));--> statement-breakpoint
ALTER POLICY "region.admin can fully access files" ON "files" TO authenticated USING ((SELECT authorize_in_region('region.admin', region_fk))) WITH CHECK ((SELECT authorize_in_region('region.admin', region_fk)));