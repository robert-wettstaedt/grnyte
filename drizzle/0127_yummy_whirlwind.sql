ALTER TABLE "grades" ADD COLUMN "ircra" integer;--> statement-breakpoint

-- The ladder gains its real low end and 9A+, and loses three grades that never existed.
--
-- FB 5A / 5B / 5C were French sport grades in a Font column: Font letters start at 6, and below
-- that the ladder reads 3, 4, 4+, 5, 5+. 5A and 5B both claimed V1, the only true thing about
-- either, so they merge onto Font 5 and 5C becomes 5+. Because 5A was the floor, every easier
-- route in the guidebook was forced up into it; those need re-grading by hand, which is now
-- possible for the first time.
--
-- Ids stay contiguous and ordered easy → hard, so everything below shifts: old 0 and 1 -> 3,
-- old n >= 2 -> n + 2, and 0/1/2/24 are new. See the invariant on `grades` in schema.ts.

-- Ids cannot move while the children point at them.
ALTER TABLE "routes" DROP CONSTRAINT "routes_grade_fk_grades_id_fk";--> statement-breakpoint
ALTER TABLE "routes" DROP CONSTRAINT "routes_user_grade_fk_grades_id_fk";--> statement-breakpoint
ALTER TABLE "ascents" DROP CONSTRAINT "ascents_grade_fk_grades_id_fk";--> statement-breakpoint

-- 1. Merge 5B into 5A, so both land on Font 5 when the shift runs.
UPDATE "routes" SET "grade_fk" = 0 WHERE "grade_fk" = 1;--> statement-breakpoint
UPDATE "routes" SET "user_grade_fk" = 0 WHERE "user_grade_fk" = 1;--> statement-breakpoint
UPDATE "ascents" SET "grade_fk" = 0 WHERE "grade_fk" = 1;--> statement-breakpoint
DELETE FROM "grades" WHERE "id" = 1;--> statement-breakpoint

-- 2. Shift every stored id. `changes` and `activities` hold grade ids as text, and 0099 has
--    already folded two years of `activities` into `changes` by the time this runs, so both
--    need it or the history silently reports the wrong grades.
UPDATE "routes" SET "grade_fk" = CASE WHEN "grade_fk" = 0 THEN 3 ELSE "grade_fk" + 2 END
  WHERE "grade_fk" IS NOT NULL;--> statement-breakpoint
UPDATE "routes" SET "user_grade_fk" = CASE WHEN "user_grade_fk" = 0 THEN 3 ELSE "user_grade_fk" + 2 END
  WHERE "user_grade_fk" IS NOT NULL;--> statement-breakpoint
UPDATE "ascents" SET "grade_fk" = CASE WHEN "grade_fk" = 0 THEN 3 ELSE "grade_fk" + 2 END
  WHERE "grade_fk" IS NOT NULL;--> statement-breakpoint

UPDATE "changes" SET "old_value" = (CASE WHEN "old_value" = '1' THEN 3 WHEN "old_value" = '0' THEN 3 ELSE "old_value"::int + 2 END)::text
  WHERE "column_name" IN ('gradeFk', 'userGradeFk') AND "old_value" ~ '^[0-9]+$';--> statement-breakpoint
UPDATE "changes" SET "new_value" = (CASE WHEN "new_value" = '1' THEN 3 WHEN "new_value" = '0' THEN 3 ELSE "new_value"::int + 2 END)::text
  WHERE "column_name" IN ('gradeFk', 'userGradeFk') AND "new_value" ~ '^[0-9]+$';--> statement-breakpoint
UPDATE "activities" SET "old_value" = (CASE WHEN "old_value" = '1' THEN 3 WHEN "old_value" = '0' THEN 3 ELSE "old_value"::int + 2 END)::text
  WHERE "column_name" IN ('gradeFk', 'userGradeFk') AND "old_value" ~ '^[0-9]+$';--> statement-breakpoint
UPDATE "activities" SET "new_value" = (CASE WHEN "new_value" = '1' THEN 3 WHEN "new_value" = '0' THEN 3 ELSE "new_value"::int + 2 END)::text
  WHERE "column_name" IN ('gradeFk', 'userGradeFk') AND "new_value" ~ '^[0-9]+$';--> statement-breakpoint

-- 3. Renumber the grades themselves, out through 1000+ so source and target ranges never
--    overlap. A single `id = id + 2` would collide on the primary key mid-statement.
UPDATE "grades" SET "id" = "id" + 1000;--> statement-breakpoint
UPDATE "grades" SET "id" = CASE WHEN "id" = 1000 THEN 3 ELSE "id" - 998 END;--> statement-breakpoint

-- 4. Labels and IRCRA for the shifted rows. Only 3 and 4 change what they say; the rest are
--    unchanged Font grades picking up their IRCRA integer.
UPDATE "grades" AS g SET "FB" = v.fb, "V" = v.v, "ircra" = v.ircra
FROM (VALUES
  (3,  'FB 5',   'V1',  14),
  (4,  'FB 5+',  'V2',  15),
  (5,  'FB 6A',  'V3',  16),
  (6,  'FB 6A+', 'V3',  17),
  (7,  'FB 6B',  'V4',  17),
  (8,  'FB 6B+', 'V4',  18),
  (9,  'FB 6C',  'V5',  19),
  (10, 'FB 6C+', 'V5',  20),
  (11, 'FB 7A',  'V6',  20),
  (12, 'FB 7A+', 'V7',  21),
  (13, 'FB 7B',  'V8',  22),
  (14, 'FB 7B+', 'V8',  23),
  (15, 'FB 7C',  'V9',  24),
  (16, 'FB 7C+', 'V10', 25),
  (17, 'FB 8A',  'V11', 26),
  (18, 'FB 8A+', 'V12', 27),
  (19, 'FB 8B',  'V13', 28),
  (20, 'FB 8B+', 'V14', 29),
  (21, 'FB 8C',  'V15', 31),
  (22, 'FB 8C+', 'V16', 32),
  (23, 'FB 9A',  'V17', 33)
) AS v(id, fb, v, ircra)
WHERE g."id" = v.id;--> statement-breakpoint

-- 5. The grades the ladder never offered. IRCRA 30 carries no boulder grade and 33/34 are
--    extrapolated: its published table stops at 8C+ = 32.
INSERT INTO "grades" ("id", "FB", "V", "ircra") VALUES
  (0,  'FB 3',   'VB',  11),
  (1,  'FB 4',   'V0',  12),
  (2,  'FB 4+',  'V0+', 13),
  (24, 'FB 9A+', 'V18', 34);--> statement-breakpoint
SELECT setval('grades_id_seq', (SELECT max("id") FROM "grades"));--> statement-breakpoint

ALTER TABLE "routes" ADD CONSTRAINT "routes_grade_fk_grades_id_fk" FOREIGN KEY ("grade_fk") REFERENCES "public"."grades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routes" ADD CONSTRAINT "routes_user_grade_fk_grades_id_fk" FOREIGN KEY ("user_grade_fk") REFERENCES "public"."grades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ascents" ADD CONSTRAINT "ascents_grade_fk_grades_id_fk" FOREIGN KEY ("grade_fk") REFERENCES "public"."grades"("id") ON DELETE no action ON UPDATE no action;
