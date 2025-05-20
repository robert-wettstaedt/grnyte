CREATE INDEX "region_members_auth_user_fk_idx" ON "region_members" USING btree ("auth_user_fk");--> statement-breakpoint
CREATE INDEX "region_members_region_fk_idx" ON "region_members" USING btree ("region_fk");--> statement-breakpoint
CREATE INDEX "region_members_user_fk_idx" ON "region_members" USING btree ("user_fk");--> statement-breakpoint
CREATE INDEX "regions_name_idx" ON "regions" USING btree ("name");--> statement-breakpoint
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
        );