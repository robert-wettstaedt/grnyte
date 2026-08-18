ALTER TABLE "events" ADD COLUMN "comment_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Seed the counter from the rows it counts, so an event written before the column carries the
-- same number one commented on after it would. Same predicate as the thread's read path: live
-- rows only, replies included.
UPDATE "events" SET "comment_count" = "counted"."total"
FROM (
  SELECT "event_fk", count(*)::integer AS "total"
  FROM "reactions"
  WHERE "type" = 'comment' AND "deleted_at" IS NULL
  GROUP BY "event_fk"
) AS "counted"
WHERE "counted"."event_fk" = "events"."id";
