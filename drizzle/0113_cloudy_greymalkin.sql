DROP INDEX "user_settings_user_fk_idx";--> statement-breakpoint
CREATE INDEX "files_path_idx" ON "files" USING btree ("path");--> statement-breakpoint
-- Sign-up writes `users` and `user_settings` as separate unwrapped statements, so an account can
-- end up with no settings row or with several. Collapse them before the index that forbids
-- duplicates. Relink first and delete second, never the other way round: the FK is NO ACTION, so a
-- row somebody still points at cannot be deleted.
--
-- A link naming a row that belongs to a DIFFERENT account is corruption whatever else is true, and
-- it is also what pins a duplicate in place. Clear those, and only those, so the legitimate links
-- below still say which row an account has been reading.
UPDATE "users" u SET "user_settings_fk" = NULL
  FROM "user_settings" s
  WHERE u."user_settings_fk" = s."id" AND s."user_fk" IS DISTINCT FROM u."id";--> statement-breakpoint
-- Point every account at the one row it keeps: whichever it already reads, else the oldest. This
-- also repairs accounts whose link was never written at all, because the client reads settings
-- through the link rather than by `user_fk`, so an unlinked row is invisible to it.
UPDATE "users" u SET "user_settings_fk" = pick."id"
  FROM (
    SELECT DISTINCT ON (s."user_fk") s."user_fk", s."id"
      FROM "user_settings" s
        JOIN "users" u2 ON u2."id" = s."user_fk"
      ORDER BY s."user_fk", (u2."user_settings_fk" = s."id") DESC NULLS LAST, s."id"
  ) pick
  WHERE u."id" = pick."user_fk" AND u."user_settings_fk" IS DISTINCT FROM pick."id";--> statement-breakpoint
-- Every account now links to exactly one of its rows, so anything else it owns is a duplicate and
-- nothing references it.
DELETE FROM "user_settings" s
  USING "users" u
  WHERE s."user_fk" = u."id" AND u."user_settings_fk" IS DISTINCT FROM s."id";--> statement-breakpoint
CREATE UNIQUE INDEX "user_settings_user_fk_idx" ON "user_settings" USING btree ("user_fk");--> statement-breakpoint
DROP POLICY "users can update own favorites" ON "favorites" CASCADE;--> statement-breakpoint
DROP POLICY "region.edit can insert route_external_resource_27crags" ON "route_external_resource_27crags" CASCADE;--> statement-breakpoint
DROP POLICY "region.edit can update route_external_resource_27crags" ON "route_external_resource_27crags" CASCADE;--> statement-breakpoint
DROP POLICY "region.edit can insert route_external_resource_8a" ON "route_external_resource_8a" CASCADE;--> statement-breakpoint
DROP POLICY "region.edit can update route_external_resource_8a" ON "route_external_resource_8a" CASCADE;--> statement-breakpoint
DROP POLICY "region.edit can insert route_external_resource_the_crag" ON "route_external_resource_the_crag" CASCADE;--> statement-breakpoint
DROP POLICY "region.edit can update route_external_resource_the_crag" ON "route_external_resource_the_crag" CASCADE;--> statement-breakpoint
DROP POLICY "region.edit can insert route_external_resources" ON "route_external_resources" CASCADE;--> statement-breakpoint
DROP POLICY "authenticated users can create regions" ON "regions" CASCADE;--> statement-breakpoint
CREATE POLICY "nobody inserts regions" ON "regions" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK (false);--> statement-breakpoint
ALTER POLICY "region.admin can manage region_members" ON "region_members" TO authenticated USING (
          (SELECT authorize_in_region('region.admin', region_fk))
          AND EXISTS (
            SELECT
              1
            FROM
              public.users u
            WHERE
              u.id = user_fk
              AND u.auth_user_fk = region_members.auth_user_fk
          )
        ) WITH CHECK (
          (SELECT authorize_in_region('region.admin', region_fk))
          AND EXISTS (
            SELECT
              1
            FROM
              public.users u
            WHERE
              u.id = user_fk
              AND u.auth_user_fk = region_members.auth_user_fk
          )
        );