DROP POLICY "authenticated users can read region_members" ON "region_members" CASCADE;--> statement-breakpoint
CREATE POLICY "region.read can update their own activities" ON "activities" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
          EXISTS (
            SELECT
              1
            FROM
              public.users u
            WHERE
              u.id = user_fk
              AND u.auth_user_fk = (SELECT auth.uid())
          ) AND EXISTS (SELECT authorize_in_region('region.read', region_fk))
        ) WITH CHECK (
          EXISTS (
            SELECT
              1
            FROM
              public.users u
            WHERE
              u.id = user_fk
              AND u.auth_user_fk = (SELECT auth.uid())
          ) AND EXISTS (SELECT authorize_in_region('region.read', region_fk))
        );