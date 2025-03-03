DROP POLICY "authenticated users can read activities" ON "activities" CASCADE;--> statement-breakpoint
DROP POLICY "users can insert activities" ON "activities" CASCADE;--> statement-breakpoint
DROP POLICY "data.edit can update bunny_streams" ON "bunny_streams" CASCADE;--> statement-breakpoint
DROP POLICY "data.edit can delete bunny_streams" ON "bunny_streams" CASCADE;--> statement-breakpoint
CREATE POLICY "data.read can insert activities" ON "activities" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT authorize('data.read')));--> statement-breakpoint
CREATE POLICY "data.read can read activities" ON "activities" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT authorize('data.read')));--> statement-breakpoint
CREATE POLICY "data.delete can delete activities" ON "activities" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT authorize('data.delete')));--> statement-breakpoint
CREATE POLICY "data.read can delete their own activities" ON "activities" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
          EXISTS (
            SELECT
              1
            FROM
              public.users u
            WHERE
              u.id = user_fk
              AND u.auth_user_fk = (SELECT auth.uid())
          )
        );--> statement-breakpoint
CREATE POLICY "data.read can update bunny_streams for files of their own ascents" ON "bunny_streams" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
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
          )
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
          )
        );--> statement-breakpoint
CREATE POLICY "data.read can delete bunny_streams for files of their own ascents" ON "bunny_streams" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
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
          )
        );