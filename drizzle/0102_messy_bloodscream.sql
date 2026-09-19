ALTER POLICY "region.read can delete their own activities" ON "activities" TO authenticated USING (
          EXISTS (
            SELECT
              1
            FROM
              public.users u
            WHERE
              u.id = user_fk
              AND u.auth_user_fk = (SELECT auth.uid())
          ) AND (SELECT authorize_in_region('region.read', region_fk))
        );--> statement-breakpoint
ALTER POLICY "region.read can update their own activities" ON "activities" TO authenticated USING (
          EXISTS (
            SELECT
              1
            FROM
              public.users u
            WHERE
              u.id = user_fk
              AND u.auth_user_fk = (SELECT auth.uid())
          ) AND (SELECT authorize_in_region('region.read', region_fk))
        ) WITH CHECK (
          EXISTS (
            SELECT
              1
            FROM
              public.users u
            WHERE
              u.id = user_fk
              AND u.auth_user_fk = (SELECT auth.uid())
          ) AND (SELECT authorize_in_region('region.read', region_fk))
        );--> statement-breakpoint
ALTER POLICY "region.read can insert changes on their own events" ON "changes" TO authenticated WITH CHECK (
          EXISTS (
            SELECT
              1
            FROM
              public.events e
              JOIN public.users u ON u.id = e.actor_fk
            WHERE
              e.id = event_fk
              AND u.auth_user_fk = (SELECT auth.uid())
              AND e.region_fk = changes.region_fk
          ) AND (SELECT authorize_in_region('region.read', region_fk))
        );--> statement-breakpoint
ALTER POLICY "region.read can update changes on their own events" ON "changes" TO authenticated USING (
          EXISTS (
            SELECT
              1
            FROM
              public.events e
              JOIN public.users u ON u.id = e.actor_fk
            WHERE
              e.id = event_fk
              AND u.auth_user_fk = (SELECT auth.uid())
              AND e.region_fk = changes.region_fk
          ) AND (SELECT authorize_in_region('region.read', region_fk))
        ) WITH CHECK (
          EXISTS (
            SELECT
              1
            FROM
              public.events e
              JOIN public.users u ON u.id = e.actor_fk
            WHERE
              e.id = event_fk
              AND u.auth_user_fk = (SELECT auth.uid())
              AND e.region_fk = changes.region_fk
          ) AND (SELECT authorize_in_region('region.read', region_fk))
        );--> statement-breakpoint
ALTER POLICY "region.read can delete changes on their own events" ON "changes" TO authenticated USING (
          EXISTS (
            SELECT
              1
            FROM
              public.events e
              JOIN public.users u ON u.id = e.actor_fk
            WHERE
              e.id = event_fk
              AND u.auth_user_fk = (SELECT auth.uid())
              AND e.region_fk = changes.region_fk
          ) AND (SELECT authorize_in_region('region.read', region_fk))
        );--> statement-breakpoint
ALTER POLICY "region.read can insert their own events" ON "events" TO authenticated WITH CHECK (
          EXISTS (
            SELECT
              1
            FROM
              public.users u
            WHERE
              u.id = actor_fk
              AND u.auth_user_fk = (SELECT auth.uid())
          ) AND (SELECT authorize_in_region('region.read', region_fk))
        );--> statement-breakpoint
ALTER POLICY "region.read can update their own events" ON "events" TO authenticated USING (
          EXISTS (
            SELECT
              1
            FROM
              public.users u
            WHERE
              u.id = actor_fk
              AND u.auth_user_fk = (SELECT auth.uid())
          ) AND (SELECT authorize_in_region('region.read', region_fk))
        ) WITH CHECK (
          EXISTS (
            SELECT
              1
            FROM
              public.users u
            WHERE
              u.id = actor_fk
              AND u.auth_user_fk = (SELECT auth.uid())
          ) AND (SELECT authorize_in_region('region.read', region_fk))
        );--> statement-breakpoint
ALTER POLICY "region.read can delete their own events" ON "events" TO authenticated USING (
          EXISTS (
            SELECT
              1
            FROM
              public.users u
            WHERE
              u.id = actor_fk
              AND u.auth_user_fk = (SELECT auth.uid())
          ) AND (SELECT authorize_in_region('region.read', region_fk))
        );--> statement-breakpoint
ALTER POLICY "users can insert own reactions" ON "reactions" TO authenticated WITH CHECK (
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
          AND (SELECT authorize_in_region('region.read', region_fk))
        );--> statement-breakpoint
ALTER POLICY "users can update own reactions" ON "reactions" TO authenticated USING (
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
          AND (SELECT authorize_in_region('region.read', region_fk))
        ) WITH CHECK (
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
          AND (SELECT authorize_in_region('region.read', region_fk))
        );--> statement-breakpoint
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
          AND (SELECT authorize_in_region('region.read', region_fk))
        );