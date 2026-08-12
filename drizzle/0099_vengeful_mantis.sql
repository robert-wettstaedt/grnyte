CREATE TABLE "changes" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"region_fk" integer NOT NULL,
	"area_fk" integer,
	"ascent_fk" integer,
	"block_fk" integer,
	"file_fk" text,
	"route_fk" integer,
	"subject_fk" integer,
	"column_name" text NOT NULL,
	"event_fk" integer NOT NULL,
	"new_value" text,
	"old_value" text,
	CONSTRAINT "changes_at_most_one_object" CHECK (num_nonnulls(area_fk, ascent_fk, block_fk, file_fk, route_fk, subject_fk) <= 1)
);
--> statement-breakpoint
ALTER TABLE "changes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "events" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"region_fk" integer NOT NULL,
	"area_fk" integer,
	"ascent_fk" integer,
	"block_fk" integer,
	"file_fk" text,
	"route_fk" integer,
	"subject_fk" integer,
	"actor_fk" integer NOT NULL,
	"metadata" text,
	"verb" text NOT NULL,
	CONSTRAINT "events_one_object" CHECK (num_nonnulls(area_fk, ascent_fk, block_fk, file_fk, route_fk, subject_fk) = 1)
);
--> statement-breakpoint
ALTER TABLE "events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "reactions" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"region_fk" integer NOT NULL,
	"deleted_at" timestamp with time zone,
	"auth_user_fk" uuid NOT NULL,
	"body" text NOT NULL,
	"event_fk" integer NOT NULL,
	"parent_fk" integer,
	"type" text NOT NULL,
	"updated_at" timestamp with time zone,
	"user_fk" integer NOT NULL,
	CONSTRAINT "reactions_body_fits_type" CHECK ((type = 'comment' AND length(body) BETWEEN 1 AND 5000) OR (type = 'emoji' AND length(body) BETWEEN 1 AND 16))
);
--> statement-breakpoint
ALTER TABLE "reactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ascents" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "changes" ADD CONSTRAINT "changes_region_fk_regions_id_fk" FOREIGN KEY ("region_fk") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "changes" ADD CONSTRAINT "changes_area_fk_areas_id_fk" FOREIGN KEY ("area_fk") REFERENCES "public"."areas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "changes" ADD CONSTRAINT "changes_ascent_fk_ascents_id_fk" FOREIGN KEY ("ascent_fk") REFERENCES "public"."ascents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "changes" ADD CONSTRAINT "changes_block_fk_blocks_id_fk" FOREIGN KEY ("block_fk") REFERENCES "public"."blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "changes" ADD CONSTRAINT "changes_file_fk_files_id_fk" FOREIGN KEY ("file_fk") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "changes" ADD CONSTRAINT "changes_route_fk_routes_id_fk" FOREIGN KEY ("route_fk") REFERENCES "public"."routes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "changes" ADD CONSTRAINT "changes_subject_fk_users_id_fk" FOREIGN KEY ("subject_fk") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "changes" ADD CONSTRAINT "changes_event_fk_events_id_fk" FOREIGN KEY ("event_fk") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_region_fk_regions_id_fk" FOREIGN KEY ("region_fk") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_area_fk_areas_id_fk" FOREIGN KEY ("area_fk") REFERENCES "public"."areas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_ascent_fk_ascents_id_fk" FOREIGN KEY ("ascent_fk") REFERENCES "public"."ascents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_block_fk_blocks_id_fk" FOREIGN KEY ("block_fk") REFERENCES "public"."blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_file_fk_files_id_fk" FOREIGN KEY ("file_fk") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_route_fk_routes_id_fk" FOREIGN KEY ("route_fk") REFERENCES "public"."routes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_subject_fk_users_id_fk" FOREIGN KEY ("subject_fk") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_actor_fk_users_id_fk" FOREIGN KEY ("actor_fk") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_region_fk_regions_id_fk" FOREIGN KEY ("region_fk") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_auth_user_fk_users_id_fk" FOREIGN KEY ("auth_user_fk") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_event_fk_events_id_fk" FOREIGN KEY ("event_fk") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_parent_fk_reactions_id_fk" FOREIGN KEY ("parent_fk") REFERENCES "public"."reactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_user_fk_users_id_fk" FOREIGN KEY ("user_fk") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "changes_region_fk_idx" ON "changes" USING btree ("region_fk");--> statement-breakpoint
CREATE UNIQUE INDEX "changes_event_fk_column_name_idx" ON "changes" USING btree ("event_fk","column_name");--> statement-breakpoint
CREATE INDEX "changes_area_fk_idx" ON "changes" USING btree ("area_fk") WHERE area_fk is not null;--> statement-breakpoint
CREATE INDEX "changes_ascent_fk_idx" ON "changes" USING btree ("ascent_fk") WHERE ascent_fk is not null;--> statement-breakpoint
CREATE INDEX "changes_block_fk_idx" ON "changes" USING btree ("block_fk") WHERE block_fk is not null;--> statement-breakpoint
CREATE INDEX "changes_file_fk_idx" ON "changes" USING btree ("file_fk") WHERE file_fk is not null;--> statement-breakpoint
CREATE INDEX "changes_route_fk_idx" ON "changes" USING btree ("route_fk") WHERE route_fk is not null;--> statement-breakpoint
CREATE INDEX "changes_subject_fk_idx" ON "changes" USING btree ("subject_fk") WHERE subject_fk is not null;--> statement-breakpoint
CREATE INDEX "events_region_fk_created_at_idx" ON "events" USING btree ("region_fk","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "events_actor_fk_idx" ON "events" USING btree ("actor_fk");--> statement-breakpoint
CREATE INDEX "events_area_fk_idx" ON "events" USING btree ("area_fk") WHERE area_fk is not null;--> statement-breakpoint
CREATE INDEX "events_ascent_fk_idx" ON "events" USING btree ("ascent_fk") WHERE ascent_fk is not null;--> statement-breakpoint
CREATE INDEX "events_block_fk_idx" ON "events" USING btree ("block_fk") WHERE block_fk is not null;--> statement-breakpoint
CREATE INDEX "events_file_fk_idx" ON "events" USING btree ("file_fk") WHERE file_fk is not null;--> statement-breakpoint
CREATE INDEX "events_route_fk_idx" ON "events" USING btree ("route_fk") WHERE route_fk is not null;--> statement-breakpoint
CREATE INDEX "events_subject_fk_idx" ON "events" USING btree ("subject_fk") WHERE subject_fk is not null;--> statement-breakpoint
CREATE INDEX "reactions_event_fk_idx" ON "reactions" USING btree ("event_fk");--> statement-breakpoint
CREATE INDEX "reactions_parent_fk_idx" ON "reactions" USING btree ("parent_fk");--> statement-breakpoint
CREATE INDEX "reactions_region_fk_idx" ON "reactions" USING btree ("region_fk");--> statement-breakpoint
CREATE INDEX "reactions_user_fk_idx" ON "reactions" USING btree ("user_fk");--> statement-breakpoint
CREATE UNIQUE INDEX "reactions_one_emoji_idx" ON "reactions" USING btree ("event_fk",coalesce("parent_fk", 0),"user_fk") WHERE "reactions"."type" = 'emoji' and "reactions"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ascents_deleted_at_idx" ON "ascents" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "files_deleted_at_idx" ON "files" USING btree ("deleted_at");--> statement-breakpoint
CREATE POLICY "region.read can insert changes on their own events" ON "changes" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
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
          ) AND EXISTS (SELECT authorize_in_region('region.read', region_fk))
        );--> statement-breakpoint
CREATE POLICY "region.read can read changes" ON "changes" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT authorize_in_region('region.read', region_fk)));--> statement-breakpoint
CREATE POLICY "region.read can update changes on their own events" ON "changes" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
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
          ) AND EXISTS (SELECT authorize_in_region('region.read', region_fk))
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
          ) AND EXISTS (SELECT authorize_in_region('region.read', region_fk))
        );--> statement-breakpoint
CREATE POLICY "region.read can delete changes on their own events" ON "changes" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
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
          ) AND EXISTS (SELECT authorize_in_region('region.read', region_fk))
        );--> statement-breakpoint
CREATE POLICY "region.read can insert their own events" ON "events" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
          EXISTS (
            SELECT
              1
            FROM
              public.users u
            WHERE
              u.id = actor_fk
              AND u.auth_user_fk = (SELECT auth.uid())
          ) AND EXISTS (SELECT authorize_in_region('region.read', region_fk))
        );--> statement-breakpoint
CREATE POLICY "region.read can read events" ON "events" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT authorize_in_region('region.read', region_fk)));--> statement-breakpoint
CREATE POLICY "region.read can update their own events" ON "events" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
          EXISTS (
            SELECT
              1
            FROM
              public.users u
            WHERE
              u.id = actor_fk
              AND u.auth_user_fk = (SELECT auth.uid())
          ) AND EXISTS (SELECT authorize_in_region('region.read', region_fk))
        ) WITH CHECK (
          EXISTS (
            SELECT
              1
            FROM
              public.users u
            WHERE
              u.id = actor_fk
              AND u.auth_user_fk = (SELECT auth.uid())
          ) AND EXISTS (SELECT authorize_in_region('region.read', region_fk))
        );--> statement-breakpoint
CREATE POLICY "region.read can delete their own events" ON "events" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
          EXISTS (
            SELECT
              1
            FROM
              public.users u
            WHERE
              u.id = actor_fk
              AND u.auth_user_fk = (SELECT auth.uid())
          ) AND EXISTS (SELECT authorize_in_region('region.read', region_fk))
        );--> statement-breakpoint
CREATE POLICY "region.delete can delete events" ON "events" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT authorize_in_region('region.delete', region_fk)));--> statement-breakpoint
CREATE POLICY "users can insert own reactions" ON "reactions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
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
        );--> statement-breakpoint
CREATE POLICY "users can update own reactions" ON "reactions" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
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
          AND EXISTS (SELECT authorize_in_region('region.read', region_fk))
        );--> statement-breakpoint
CREATE POLICY "users can delete own reactions" ON "reactions" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT auth.uid()) = auth_user_fk);--> statement-breakpoint
CREATE POLICY "region.read can read reactions" ON "reactions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT authorize_in_region('region.read', region_fk)));--> statement-breakpoint
CREATE POLICY "region.delete can delete reactions" ON "reactions" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT authorize_in_region('region.delete', region_fk)));
--> statement-breakpoint
-- ===========================================================================================
-- BACKFILL: fold `activities` into `events` + `changes`.
--
-- `activities` is left completely untouched. Keeping the source rows is what makes this
-- checkable, which is the reason the table is replaced rather than altered: the DO block at the
-- end asserts the result against the source and aborts the migration if the two disagree.
--
-- The fold is gaps-and-islands over (actor, object, region, verb, metadata) with a 15-minute
-- gap. That is the same rule `createUpdateActivity` applies one column at a time today, lifted
-- to the event, so a save that wrote three column rows becomes one event with three change
-- rows and a 2024 card renders exactly like one written tomorrow: one event, one reaction bar.
--
-- Rows whose entity was hard-deleted cannot become events, because an event names its object
-- with a real foreign key. They stay in `activities` and are reported below, never dropped.
-- ===========================================================================================

-- Provenance, so `changes` finds the event its rows folded into and the assertions can compare
-- the two tables. Both this column and the working table are dropped at the end.
ALTER TABLE "events" ADD COLUMN "_backfill_anchor" integer;--> statement-breakpoint

CREATE TABLE "_backfill_islands" AS
WITH resolvable AS (
  -- Only rows whose object still exists, and the AS2 verb each one maps to. The clear cases are
  -- named; the rest fall through to create/update/delete, which is what they already meant. The
  -- write path in step 2 emits the precise verb from the call site, where it is known exactly.
  SELECT a.*,
    CASE
      WHEN a.type = 'uploaded'                                                           THEN 'add'
      WHEN a.type = 'created' AND a.entity_type = 'user' AND a.column_name = 'role'       THEN 'join'
      WHEN a.type = 'created' AND a.entity_type = 'user' AND a.column_name = 'invitation' THEN 'invite'
      WHEN a.type = 'updated' AND a.entity_type = 'user' AND a.column_name = 'invitation' THEN 'accept'
      WHEN a.type = 'deleted' AND a.entity_type = 'user' AND a.column_name = 'membership' THEN 'leave'
      WHEN a.type = 'deleted' AND a.column_name IS NOT NULL                               THEN 'remove'
      WHEN a.type = 'created'                                                             THEN 'create'
      WHEN a.type = 'updated'                                                             THEN 'update'
      WHEN a.type = 'deleted'                                                             THEN 'delete'
    END AS verb
  FROM "activities" a
  WHERE (a.entity_type = 'area'   AND EXISTS (SELECT 1 FROM "areas"   x WHERE x.id::text = a.entity_id))
     OR (a.entity_type = 'block'  AND EXISTS (SELECT 1 FROM "blocks"  x WHERE x.id::text = a.entity_id))
     OR (a.entity_type = 'route'  AND EXISTS (SELECT 1 FROM "routes"  x WHERE x.id::text = a.entity_id))
     OR (a.entity_type = 'ascent' AND EXISTS (SELECT 1 FROM "ascents" x WHERE x.id::text = a.entity_id))
     OR (a.entity_type = 'file'   AND EXISTS (SELECT 1 FROM "files"   x WHERE x.id      = a.entity_id))
     OR (a.entity_type = 'user'   AND EXISTS (SELECT 1 FROM "users"   x WHERE x.id::text = a.entity_id))
),
marked AS (
  -- 1 opens a new island, 0 continues the open one. A null LAG (the first row of a partition)
  -- falls to ELSE, which is what makes it open rather than continue.
  SELECT r.*,
    CASE WHEN r.created_at - LAG(r.created_at) OVER w <= INTERVAL '15 minutes' THEN 0 ELSE 1 END AS opens
  FROM resolvable r
  WINDOW w AS (
    PARTITION BY r.user_fk, r.entity_type, r.entity_id, r.region_fk, r.verb, COALESCE(r.metadata, '')
    ORDER BY r.created_at, r.id
  )
)
SELECT m.*,
  COALESCE(m.metadata, '') AS meta,
  SUM(m.opens) OVER (
    PARTITION BY m.user_fk, m.entity_type, m.entity_id, m.region_fk, m.verb, COALESCE(m.metadata, '')
    ORDER BY m.created_at, m.id
  ) AS island
FROM marked m;--> statement-breakpoint
INSERT INTO "events" (
  "created_at", "region_fk", "actor_fk", "verb", "metadata",
  "area_fk", "ascent_fk", "block_fk", "file_fk", "route_fk", "subject_fk", "_backfill_anchor"
)
SELECT
  -- The latest row in the island, because the fold bumps `created_at` so a continued event
  -- returns to the top of the feed. Same behaviour, applied retroactively.
  MAX(i.created_at),
  i.region_fk,
  i.user_fk,
  i.verb,
  -- Non-update rows carry their payload in old_value/new_value and have no `changes` row to put
  -- it in, so it lands in metadata or it is lost: an invitation's email address, a removed
  -- member's name, the coordinates a parking pin used to hold. For `update` the payload belongs
  -- in `changes` and metadata keeps its own meaning.
  CASE
    WHEN i.verb = 'update' THEN MIN(i.metadata)
    ELSE COALESCE(MIN(i.metadata), MIN(i.new_value), MIN(i.old_value))
  END,
  CASE WHEN i.entity_type = 'area'   THEN i.entity_id::integer END,
  CASE WHEN i.entity_type = 'ascent' THEN i.entity_id::integer END,
  CASE WHEN i.entity_type = 'block'  THEN i.entity_id::integer END,
  CASE WHEN i.entity_type = 'file'   THEN i.entity_id           END,
  CASE WHEN i.entity_type = 'route'  THEN i.entity_id::integer END,
  CASE WHEN i.entity_type = 'user'   THEN i.entity_id::integer END,
  MIN(i.id)
FROM "_backfill_islands" i
GROUP BY i.region_fk, i.user_fk, i.entity_type, i.entity_id, i.verb, i.meta, i.island;--> statement-breakpoint

INSERT INTO "changes" ("created_at", "region_fk", "event_fk", "column_name", "old_value", "new_value")
WITH per_column AS (
  -- The column merge, retroactively: A to B then B to C inside one island is one row, A to C.
  -- B was never a state the crag was left in, so it is nobody's business.
  SELECT
    i.region_fk, i.user_fk, i.entity_type, i.entity_id, i.verb, i.meta, i.island, i.column_name,
    MAX(i.created_at) AS created_at,
    (ARRAY_AGG(i.old_value ORDER BY i.created_at, i.id))[1]           AS old_value,
    (ARRAY_AGG(i.new_value ORDER BY i.created_at DESC, i.id DESC))[1] AS new_value
  FROM "_backfill_islands" i
  WHERE i.verb = 'update' AND i.column_name IS NOT NULL
  GROUP BY i.region_fk, i.user_fk, i.entity_type, i.entity_id, i.verb, i.meta, i.island, i.column_name
),
island_anchor AS (
  SELECT i.region_fk, i.user_fk, i.entity_type, i.entity_id, i.verb, i.meta, i.island, MIN(i.id) AS anchor
  FROM "_backfill_islands" i
  GROUP BY i.region_fk, i.user_fk, i.entity_type, i.entity_id, i.verb, i.meta, i.island
)
SELECT c.created_at, c.region_fk, e.id, c.column_name, c.old_value, c.new_value
FROM per_column c
JOIN island_anchor a USING (region_fk, user_fk, entity_type, entity_id, verb, meta, island)
JOIN "events" e ON e."_backfill_anchor" = a.anchor
-- The undo case: an edit that ended where it started is not a change. `IS DISTINCT FROM` so a
-- field cleared to '' against a NULL is judged the same way `changed()` judges it in the app.
WHERE c.old_value IS DISTINCT FROM c.new_value;--> statement-breakpoint

-- An update whose every change undid itself is not an event. Same rule the live fold applies
-- when it deletes the last change row out of an event.
DELETE FROM "events" e
WHERE e."verb" = 'update' AND NOT EXISTS (SELECT 1 FROM "changes" c WHERE c."event_fk" = e."id");--> statement-breakpoint

DO $$
DECLARE
  skipped_rows integer;
  kept_rows    integer;
  island_count integer;
  event_count  integer;
  bad          integer;
  orphans      text;
BEGIN
  SELECT count(*) INTO kept_rows    FROM "_backfill_islands";
  SELECT count(*) INTO skipped_rows FROM "activities" a
    WHERE NOT EXISTS (SELECT 1 FROM "_backfill_islands" i WHERE i.id = a.id);
  SELECT count(*) INTO island_count FROM (
    SELECT 1 FROM "_backfill_islands" GROUP BY region_fk, user_fk, entity_type, entity_id, verb, meta, island
  ) s;
  SELECT count(*) INTO event_count FROM "events";

  -- Only an `update` island is allowed to end up without an event, and only because every one
  -- of its columns undid itself. Anything else vanishing is a bug in the grouping, and this is
  -- the check that catches it. (The previous version compared two counts that cannot diverge
  -- by construction, so it could never fire.)
  SELECT count(*) INTO bad FROM (
    SELECT verb, MIN(id) AS anchor FROM "_backfill_islands"
    GROUP BY region_fk, user_fk, entity_type, entity_id, verb, meta, island
  ) i
  WHERE i.verb <> 'update' AND NOT EXISTS (SELECT 1 FROM "events" e WHERE e."_backfill_anchor" = i.anchor);
  IF bad > 0 THEN RAISE EXCEPTION 'backfill lost % non-update islands', bad; END IF;

  -- A change may only hang off an update event, and only off one in its own region. Both can
  -- fire: the insert reaches its event through an anchor join, and a wrong anchor lands a diff
  -- on a stranger's card.
  SELECT count(*) INTO bad FROM "changes" c JOIN "events" e ON e.id = c."event_fk"
    WHERE e."verb" <> 'update' OR e."region_fk" <> c."region_fk";
  IF bad > 0 THEN RAISE EXCEPTION 'backfill mis-assigned % change rows', bad; END IF;

  -- Every event must name the entity its source row named. Catches a mistyped CASE arm, which
  -- would otherwise attribute a whole region's history to the wrong object.
  SELECT count(*) INTO bad FROM "events" e JOIN "activities" a ON a.id = e."_backfill_anchor"
    WHERE COALESCE(
      e."area_fk"::text, e."ascent_fk"::text, e."block_fk"::text,
      e."file_fk", e."route_fk"::text, e."subject_fk"::text
    ) IS DISTINCT FROM a."entity_id";
  IF bad > 0 THEN RAISE EXCEPTION 'backfill put % events on the wrong object', bad; END IF;

  SELECT string_agg(t || ' ' || n, ', ' ORDER BY n DESC) INTO orphans FROM (
    SELECT a.entity_type AS t, count(*) AS n FROM "activities" a
    WHERE NOT EXISTS (SELECT 1 FROM "_backfill_islands" i WHERE i.id = a.id)
    GROUP BY a.entity_type
  ) o;

  RAISE NOTICE 'backfill: % rows -> % islands -> % events (% collapsed as undone)',
    kept_rows, island_count, event_count, island_count - event_count;
  RAISE NOTICE 'backfill: % rows skipped, entity hard-deleted (%). They stay in activities.',
    skipped_rows, COALESCE(orphans, 'none');
END $$;--> statement-breakpoint

DROP TABLE "_backfill_islands";--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN "_backfill_anchor";
