-- Keep `events.comment_count` true from here on. 0112 seeded the column; this maintains it.
--
-- Its own migration rather than an append to 0112: the migrator compares the journal's `when`
-- against `max(created_at)` in `__drizzle_migrations` and skips anything that is not newer, so
-- statements added to a file that has already run are never executed anywhere. The file hash has
-- nothing to do with it.
--
-- A trigger rather than two lines in `postComment`/`deleteComment`, which is where this repo
-- otherwise puts its writes, for two reasons. The handlers run under RLS on the caller's
-- connection, and `events` has no UPDATE policy for a member: the counter write would match zero
-- rows and say nothing about it, which is the worst possible failure for a number nobody
-- recomputes. And the `region.delete` moderator policy can remove a comment without going through
-- either handler.
--
-- SECURITY DEFINER for the same RLS reason, with the search path pinned so the body cannot be
-- resolved against a caller-controlled schema.
--
-- `event_fk` moving between events is not handled: nothing moves a comment to another card, and a
-- guard for it would be untested code for a case no writer can produce.
CREATE OR REPLACE FUNCTION public.sync_event_comment_count() RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  was_live boolean := TG_OP <> 'INSERT' AND OLD.type = 'comment' AND OLD.deleted_at IS NULL;
  is_live boolean := TG_OP <> 'DELETE' AND NEW.type = 'comment' AND NEW.deleted_at IS NULL;
BEGIN
  IF was_live AND NOT is_live THEN
    UPDATE public.events SET comment_count = greatest(comment_count - 1, 0) WHERE id = OLD.event_fk;
  ELSIF is_live AND NOT was_live THEN
    UPDATE public.events SET comment_count = comment_count + 1 WHERE id = NEW.event_fk;
  END IF;

  RETURN NULL;
END;
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS "reactions_sync_event_comment_count" ON "reactions";--> statement-breakpoint
CREATE TRIGGER "reactions_sync_event_comment_count"
AFTER INSERT OR UPDATE OR DELETE ON "reactions"
FOR EACH ROW EXECUTE FUNCTION public.sync_event_comment_count();--> statement-breakpoint
-- Recount once, because the trigger was missing while comments were already being written: any
-- database that ran 0112 and has taken a comment since holds a frozen number.
UPDATE "events" SET "comment_count" = COALESCE("counted"."total", 0)
FROM (
  SELECT "event_fk", count(*)::int AS "total"
  FROM "reactions"
  WHERE "type" = 'comment' AND "deleted_at" IS NULL
  GROUP BY "event_fk"
) AS "counted"
WHERE "counted"."event_fk" = "events"."id";
