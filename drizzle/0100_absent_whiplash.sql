ALTER POLICY "users can delete own reactions" ON "reactions" TO authenticated USING (
          (SELECT auth.uid()) = auth_user_fk
          AND EXISTS (
            SELECT
              1
            FROM
              public.users u
            WHERE
              u.id = user_fk
              AND u.auth_user_fk = (SELECT auth.uid())
          )
          AND EXISTS (
            SELECT
              1
            FROM
              public.events e
            WHERE
              e.id = event_fk
              AND e.region_fk = reactions.region_fk
          )
          AND EXISTS (SELECT authorize_in_region('region.read', region_fk))
        );