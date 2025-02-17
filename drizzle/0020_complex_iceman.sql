ALTER TABLE "ascents" ADD COLUMN "rating" integer;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "user_rating" integer;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "user_grade_fk" integer;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "routes" ADD CONSTRAINT "routes_user_grade_fk_grades_id_fk" FOREIGN KEY ("user_grade_fk") REFERENCES "public"."grades"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
