ALTER TABLE "events" ADD COLUMN "promoted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- How many DISTINCT people, weighted, have to turn up before a card says so.
--
-- One score per PERSON, then summed. A comment is worth two, which is the one genuinely reusable
-- idea from EdgeRank: weight the action by what it costs to perform, and a comment is not a tap.
--
-- Grouping by user first is the load-bearing part. Adding two independent DISTINCT counts let one
-- reader who both reacted and commented score 1 + 2 = 3 and clear the floor of three on their own,
-- which is exactly the "anybody can promote their friend's card" failure this is written to stop,
-- and it made the floor's own argument ("three of five really is the community turning up") false.
-- Somebody who does both is still one person, and worth what a commenter is worth.
--
-- The event's own actor is excluded. Nobody's own applause counts toward "the community showed up",
-- and the reaction bar already refuses them the button.
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
-- What that score has to beat, scaled to how many people could possibly turn up.
--
-- A flat number cannot work at both ends: a region of five would never reach eight, and a region of
-- two hundred would cross it on any card at all. A third of the membership is the shape; the floor
-- and the ceiling are what stop it degenerating.
--
-- The floor of three is the important half. In a five-person region a third rounds to two, which is
-- just your two mates; three of five really is the community turning up. The ceiling of twelve
-- keeps the claim reachable in a region that has grown past the point where a third of it ever
-- looks at one card.
--
-- Both numbers are guesses, and deliberately so: reactions did not exist when this was written, so
-- there is no data to set them from. They are one expression in one place precisely so that a month
-- of real reactions can move them.
CREATE OR REPLACE FUNCTION public.event_promotion_threshold(p_region_fk integer)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT least(12, greatest(3, ceil(0.33 * count(*))::integer))
  FROM public.region_members m
  WHERE m.region_fk = p_region_fk AND m.is_active;
$$;--> statement-breakpoint
-- Set the flag, never clear it.
--
-- Sticky on purpose. Reactions can be taken back, so a symmetric rule would let a banner appear and
-- then vanish, which reads worse than one that lingers, and would flap for an event sitting exactly
-- on the threshold.
--
-- A trigger rather than the two handlers that write reactions: they run under RLS on the caller's
-- connection and `events` has no UPDATE policy for a member, so a write there would match no rows
-- and report nothing at all.
CREATE OR REPLACE FUNCTION public.sync_event_promoted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_fk integer := coalesce(NEW.event_fk, OLD.event_fk);
  v_region_fk integer;
  v_promoted boolean;
BEGIN
  SELECT e.region_fk, e.promoted INTO v_region_fk, v_promoted
  FROM public.events e WHERE e.id = v_event_fk;

  IF v_promoted IS NULL OR v_promoted THEN
    RETURN NULL;
  END IF;

  IF public.event_engagement_score(v_event_fk) >= public.event_promotion_threshold(v_region_fk) THEN
    UPDATE public.events SET promoted = true WHERE id = v_event_fk;
  END IF;

  RETURN NULL;
END;
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS sync_event_promoted ON public.reactions;--> statement-breakpoint
CREATE TRIGGER sync_event_promoted
AFTER INSERT OR UPDATE OR DELETE ON public.reactions
FOR EACH ROW EXECUTE FUNCTION public.sync_event_promoted();--> statement-breakpoint
-- Seed the flag from the rows it counts, so an event that already cleared the bar before the column
-- existed carries it too. Same expressions as the trigger, so the backfill and the live path cannot
-- disagree about who qualifies.
UPDATE "events" SET "promoted" = true
WHERE public.event_engagement_score("events"."id") >= public.event_promotion_threshold("events"."region_fk");
