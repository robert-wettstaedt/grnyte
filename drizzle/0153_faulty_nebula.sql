CREATE TABLE "region_counters" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"events" bigint DEFAULT 0 NOT NULL,
	"region_fk" integer NOT NULL,
	CONSTRAINT "region_counters_region_fk_unique" UNIQUE("region_fk")
);
--> statement-breakpoint
ALTER TABLE "region_counters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_counters" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"auth_user_fk" uuid NOT NULL,
	"notifications" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "user_counters_auth_user_fk_unique" UNIQUE("auth_user_fk")
);
--> statement-breakpoint
ALTER TABLE "user_counters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "region_counters" ADD CONSTRAINT "region_counters_region_fk_regions_id_fk" FOREIGN KEY ("region_fk") REFERENCES "public"."regions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_counters" ADD CONSTRAINT "user_counters_auth_user_fk_users_id_fk" FOREIGN KEY ("auth_user_fk") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- A counter row is a lock the whole region shares, so `touch_marker` only notes what moved and `flush_markers`,
-- deferred to the commit, moves each marker once, in one order. SECURITY DEFINER as in 0115.
CREATE OR REPLACE FUNCTION public.touch_marker() RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  touched text := coalesce(current_setting('grnyte.touched_markers', true), '');
  keys text[] := '{}';
  key text;
BEGIN
  -- Both rows on an update: `carryLog` moves events between regions.
  IF TG_TABLE_NAME = 'events' THEN
    IF TG_OP <> 'INSERT' THEN keys := keys || ('region:' || OLD.region_fk); END IF;
    IF TG_OP <> 'DELETE' THEN keys := keys || ('region:' || NEW.region_fk); END IF;
  ELSE
    IF TG_OP <> 'INSERT' THEN keys := keys || ('user:' || OLD.auth_user_fk); END IF;
    IF TG_OP <> 'DELETE' THEN keys := keys || ('user:' || NEW.auth_user_fk); END IF;
  END IF;

  FOREACH key IN ARRAY keys LOOP
    IF position(',' || key || ',' IN ',' || touched || ',') = 0 THEN
      touched := concat_ws(',', nullif(touched, ''), key);
    END IF;
  END LOOP;

  PERFORM set_config('grnyte.touched_markers', touched, true);
  RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.flush_markers() RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  touched text := coalesce(current_setting('grnyte.touched_markers', true), '');
  key text;
BEGIN
  -- Every call after the first of a commit.
  IF touched = '' THEN
    RETURN NULL;
  END IF;
  PERFORM set_config('grnyte.touched_markers', '', true);

  FOR key IN SELECT unnest(string_to_array(touched, ',')) ORDER BY 1 LOOP
    BEGIN
      IF key LIKE 'region:%' THEN
        INSERT INTO region_counters AS c (region_fk, events) VALUES (split_part(key, ':', 2)::integer, 1)
        ON CONFLICT (region_fk) DO UPDATE SET events = c.events + 1;
      ELSE
        INSERT INTO user_counters AS c (auth_user_fk, notifications) VALUES (split_part(key, ':', 2)::uuid, 1)
        ON CONFLICT (auth_user_fk) DO UPDATE SET notifications = c.notifications + 1;
      END IF;
    EXCEPTION WHEN foreign_key_violation THEN
      -- This transaction deleted the region too; its marker went with it.
      NULL;
    END;
  END LOOP;
  RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "events_touch_marker"
AFTER INSERT OR UPDATE OR DELETE ON "events"
FOR EACH ROW EXECUTE FUNCTION public.touch_marker();--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "events_flush_markers"
AFTER INSERT OR UPDATE OR DELETE ON "events"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.flush_markers();
--> statement-breakpoint
CREATE TRIGGER "notifications_touch_marker"
AFTER INSERT OR DELETE ON "notifications"
FOR EACH ROW EXECUTE FUNCTION public.touch_marker();--> statement-breakpoint
-- The push stamp alone changes nothing a reader sees.
CREATE TRIGGER "notifications_touch_marker_update"
AFTER UPDATE ON "notifications"
FOR EACH ROW
WHEN ((to_jsonb(OLD) - 'pushed_at') IS DISTINCT FROM (to_jsonb(NEW) - 'pushed_at'))
EXECUTE FUNCTION public.touch_marker();--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "notifications_flush_markers"
AFTER INSERT OR UPDATE OR DELETE ON "notifications"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.flush_markers();--> statement-breakpoint
-- Only the publication's owner may add to it: anyone else gets a warning, not a failed release.
DO $$
DECLARE
  name text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'powersync') THEN
    FOREACH name IN ARRAY ARRAY['content_reports', 'region_counters', 'user_counters'] LOOP
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'powersync' AND schemaname = 'public' AND tablename = name
      ) THEN
        EXECUTE format('ALTER PUBLICATION powersync ADD TABLE public.%I', name);
      END IF;
    END LOOP;
  END IF;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE WARNING 'the powersync publication was not changed: %', SQLERRM;
END;
$$;
