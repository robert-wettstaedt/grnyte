ALTER POLICY "region.read can update their own ascents" ON "ascents" TO authenticated USING (
          EXISTS (
            SELECT
              1
            FROM
              public.users u
            WHERE
              u.id = created_by
              AND u.auth_user_fk = (SELECT auth.uid())
          ) AND (SELECT authorize_in_region('region.read', region_fk))
        ) WITH CHECK (
          EXISTS (
            SELECT
              1
            FROM
              public.users u
            WHERE
              u.id = created_by
              AND u.auth_user_fk = (SELECT auth.uid())
          ) AND (SELECT authorize_in_region('region.read', region_fk))
        );--> statement-breakpoint
ALTER POLICY "region.read can delete their own ascents" ON "ascents" TO authenticated USING (
          EXISTS (
            SELECT
              1
            FROM
              public.users u
            WHERE
              u.id = created_by
              AND u.auth_user_fk = (SELECT auth.uid())
          ) AND (SELECT authorize_in_region('region.read', region_fk))
        );--> statement-breakpoint
ALTER POLICY "region.read can update bunny_streams for files of their own ascents" ON "bunny_streams" TO authenticated USING (
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
          ) AND (SELECT authorize_in_region('region.read', region_fk))
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
          ) AND (SELECT authorize_in_region('region.read', region_fk))
        );--> statement-breakpoint
ALTER POLICY "region.read can delete bunny_streams for files of their own ascents" ON "bunny_streams" TO authenticated USING (
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
          ) AND (SELECT authorize_in_region('region.read', region_fk))
        );--> statement-breakpoint
ALTER POLICY "region.read can update files belonging to their own ascents" ON "files" TO authenticated USING (
          EXISTS (
            SELECT
              1
            FROM
              public.ascents a
              JOIN public.users u ON a.created_by = u.id
            WHERE
              a.id = ascent_fk
              AND u.auth_user_fk = (SELECT auth.uid())
          ) AND (SELECT authorize_in_region('region.read', region_fk))
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
          ) AND (SELECT authorize_in_region('region.read', region_fk))
        );--> statement-breakpoint
ALTER POLICY "region.read can delete files belonging to their own ascents" ON "files" TO authenticated USING (
          EXISTS (
            SELECT
              1
            FROM
              public.ascents a
              JOIN public.users u ON a.created_by = u.id
            WHERE
              a.id = ascent_fk
              AND u.auth_user_fk = (SELECT auth.uid())
          ) AND (SELECT authorize_in_region('region.read', region_fk))
        );