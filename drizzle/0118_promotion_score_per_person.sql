-- Re-apply the per-person engagement score to databases that already ran 0117.
--
-- 0117 shipped a scorer that added two independent DISTINCT counts, so one reader who both reacted
-- and commented scored 1 + 2 = 3 and cleared the floor of three on their own. That was corrected by
-- editing 0117 itself, which is wrong and is why this file exists: the migrator compares the
-- journal's `when` against `max(created_at)` in `__drizzle_migrations` and skips anything not newer,
-- so a statement edited into an already-applied file never runs anywhere. The file hash has nothing
-- to do with it. Fresh databases got the fix; every database that had already run 0117 kept the
-- broken scorer, and would have carried it to production.
--
-- Identical body to the one 0117 now holds, so this is a no-op on a database migrated from empty
-- and the repair on one that was not. `CREATE OR REPLACE` is what makes both safe.
--
-- Grouping by user first is the load-bearing part: somebody who both reacts and comments is still
-- one person, and worth what a commenter is worth. The event's own actor is excluded, because
-- nobody's own applause is the community turning up.
CREATE OR REPLACE FUNCTION public.event_engagement_score(p_event_fk integer)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(sum(CASE WHEN per_person.commented THEN 2 ELSE 1 END), 0)::integer
  FROM (
    SELECT bool_or(r.type = 'comment') AS commented
    FROM public.reactions r
    JOIN public.events e ON e.id = r.event_fk
    WHERE r.event_fk = p_event_fk
      AND r.deleted_at IS NULL
      AND r.user_fk <> e.actor_fk
    GROUP BY r.user_fk
  ) per_person;
$$;--> statement-breakpoint
-- Clear any flag the broken scorer granted, then re-seed from the corrected one. A promotion is
-- sticky once earned, but a promotion nobody earned is not something to keep sticky.
UPDATE "events" SET "promoted" = false WHERE "promoted";--> statement-breakpoint
UPDATE "events" SET "promoted" = true
WHERE public.event_engagement_score("events"."id") >= public.event_promotion_threshold("events"."region_fk");
